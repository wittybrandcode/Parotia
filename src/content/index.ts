import type {
  ActionLogEntry,
  BackgroundCommand,
  CleanupState,
  FreezeState,
  NewsCleanSession,
  SitePreset,
} from "@shared/types";
import { isBackgroundCommand } from "@shared/types";
import { SCHEMA_VERSION } from "@shared/constants";
import { createId } from "@shared/utils/id";
import { ChromeStoragePresetRepository } from "@storage/chromeStorageRepositories";
import { defaultPresets } from "@presets/defaultPresets";
import { matchPresets, normalizeHostname, presetEnabled } from "@presets/matcher";
import { createOverlay, type OverlayInstance } from "./overlay/overlay";
import { currentPageContext, createSession, transitionSession } from "./session/session";
import { HistoryEngine } from "./mutation/history";
import { DefaultMutationEngine } from "./mutation/mutationEngine";
import { DefaultFreezeEngine } from "./freeze/freezeEngine";
import { DefaultExtractionEngine } from "./extraction/extractionEngine";
import { DefaultCleanupEngine } from "./cleanup/cleanupEngine";
import { DefaultCaptureStitcher, type CaptureStitcher } from "./capture/captureStitcher";
import { ElementCaptureIsolator, cropDataUrlToPng, loadBitmap, sleep, waitForElementRendering } from "./capture/elementCapture";
import { MAX_CANVAS_DIMENSION, exceedsCanvasLimit, planSlices } from "./capture/sliceMath";
import { FixedHeaderManager } from "./capture/fixedHeaders";
import { KeyboardShortcuts } from "./keyboard/shortcuts";

/**
 * Content Runtime entry. Wires the session, engines, and overlay together and
 * bridges typed messages from the Service Worker. The page DOM is only ever
 * touched through the engines — never directly here.
 */

let session: NewsCleanSession | null = null;
let overlay: OverlayInstance | null = null;
let cleanup: DefaultCleanupEngine | null = null;
let stitcher: CaptureStitcher | null = null;
const fixedHeaders = new FixedHeaderManager();

const presetRepository = new ChromeStoragePresetRepository();

const history = new HistoryEngine();
const mutations = new DefaultMutationEngine(history);
const freeze = new DefaultFreezeEngine();
const extraction = new DefaultExtractionEngine();
const elementCapture = new ElementCaptureIsolator();
let shortcuts: KeyboardShortcuts | null = null;

function buildCleanupEngine(): DefaultCleanupEngine {
  return new DefaultCleanupEngine(mutations, extraction, {
    // The floating action bar over the picked element runs the exact same
    // commands as the toolbar, so state, counts, and Undo stay consistent.
    inspectorActionHandlers: {
      onDelete: () => {
        void handleCommand({
          type: "DELETE_ELEMENT",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        });
      },
      onHide: () => {
        void handleCommand({
          type: "HIDE_ELEMENT",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        });
      },
      onKeep: () => {
        void handleCommand({
          type: "KEEP_ELEMENT",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        });
      },
      onShow: () => {
        void handleCommand({
          type: "SHOW_ELEMENT",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        });
      },
      isHidden: () => (cleanup?.selected ? cleanup.isHidden(cleanup.selected) : false),
      onDeleteSimilar: () => {
        void handleCommand({
          type: "DELETE_MATCHING",
          payload: { sessionId: session?.id ?? "", elementId: cleanup?.selected?.id ?? "" },
        });
      },
      // CAPTURE is orchestrated by the Service Worker, so unlike the cleanup
      // actions above this one goes straight to the extension (not the local
      // handler) so the viewport can be captured and the PNG downloaded.
      onCapture: () => {
        const ref = cleanup?.selected;
        if (!ref) return;
        void chrome.runtime.sendMessage({
          type: "CAPTURE",
          payload: { sessionId: session?.id ?? "", mode: "ELEMENT", elementId: ref.id },
        } satisfies BackgroundCommand);
      },
    },
  });
}

/** Compact preset status for the toolbar. */
function presetSummary(): { detected: boolean; applied: boolean; id?: string; name?: string; enabled?: boolean } {
  const preset = session?.preset.preset;
  return {
    detected: session?.preset.detected ?? false,
    applied: session?.preset.applied ?? false,
    ...(preset ? { id: preset.id, name: preset.metadata.name, enabled: presetEnabled(preset) } : {}),
  };
}

/** Session action log (newest first), derived live from the history stacks. */
function actionLogState(): ActionLogEntry[] {
  return history.log();
}

/** Undo/redo availability straight from the history stacks, driving the toolbar buttons. */
function historyState(): { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string } {
  return {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    ...(history.undoLabel ? { undoLabel: history.undoLabel } : {}),
    ...(history.redoLabel ? { redoLabel: history.redoLabel } : {}),
  };
}

/** Seeds built-in example presets on the very first run (never after deletion). */
async function ensureDefaultPresets(): Promise<void> {
  try {
    const existing = await presetRepository.list();
    if (existing.length > 0) return;
    for (const preset of defaultPresets()) {
      await presetRepository.save(preset);
    }
  } catch (error) {
    console.warn("[parotia] default preset seeding failed", error);
  }
}

/**
 * Detects a matching preset for the current site on session start. A preset
 * is NEVER applied by force: it only auto-applies when the user opted in by
 * enabling it (persisted `enabled` flag). Detected-but-disabled presets just
 * surface the "Enable" button in the toolbar.
 */
async function maybeApplyPreset(): Promise<void> {
  if (!session || !cleanup || session.preset.applied) return;
  try {
    await ensureDefaultPresets();
    const page = currentPageContext();
    const matches = matchPresets(await presetRepository.list(), {
      hostname: page.hostname,
      pathname: page.pathname,
    });
    const best = matches[0];
    if (!best) return;
    session.preset.detected = true;
    session.preset.preset = best.preset;
    if (!presetEnabled(best.preset)) return;
    cleanup.applyPreset(best.preset);
    session.preset.applied = true;
  } catch (error) {
    console.warn("[parotia] preset auto-apply failed", error);
  }
}

/** Pushes the latest state to the toolbar iframe (which talks to the page). */
function broadcastState(): void {
  if (!session || !overlay) return;
  const state = {
    sessionId: session.id,
    freeze: freeze.getState() as FreezeState,
    cleanup: cleanup?.getState() as CleanupState | undefined,
    status: session.status,
    preset: presetSummary(),
    actionLog: actionLogState(),
    history: historyState(),
  };
  const frame = overlay.shadow.querySelector<HTMLIFrameElement>("iframe[data-newsclean-frame]");
  frame?.contentWindow?.postMessage({ source: "newsclean-content", type: "STATE", state }, "*");
}

function ensureRuntime(): void {
  if (session && overlay && cleanup) return;
  const page = currentPageContext();
  session = createSession(page);
  overlay = createOverlay();
  cleanup = buildCleanupEngine();
  // Keyboard shortcuts reuse the exact same command pipeline as the toolbar.
  shortcuts = new KeyboardShortcuts({
    getState: () => ({
      frozen: freeze.getState().status === "FROZEN",
      inspecting: cleanup?.inspecting ?? false,
      hasSelection: cleanup?.selected !== null,
    }),
    dispatch: (command) => {
      void handleCommand({
        ...command,
        payload: { ...command.payload, sessionId: session?.id ?? "" },
      } as BackgroundCommand);
    },
  });
  shortcuts.start();
  transitionSession(session, "INITIALIZING");
  transitionSession(session, "ACTIVE");
}

async function handleCommand(command: BackgroundCommand): Promise<unknown> {
  const invalid = validatePayload(command);
  if (invalid) return { success: false, error: { code: "INVALID_PAYLOAD", message: invalid } };

  switch (command.type) {
    case "START_SESSION":
      ensureRuntime();
      await maybeApplyPreset();
      broadcastState();
      return getSnapshot();

    case "FREEZE_PAGE": {
      ensureRuntime();
      // Session stays ACTIVE while freezing; the freeze sub-state tracks FROZEN.
      const result = await freeze.freeze(command.payload.strategy);
      broadcastState();
      return result;
    }

    case "UNFREEZE_PAGE":
      await freeze.unfreeze();
      broadcastState();
      return freeze.getState();

    case "INSPECT_START": {
      // Toggle like the DevTools picker: start inspecting, or stop if already active.
      if (cleanup?.inspecting) {
        cleanup.stopInspecting();
      } else {
        cleanup?.startInspecting();
      }
      broadcastState();
      return { active: cleanup?.inspecting ?? false };
    }

    case "INSPECT_STOP":
      cleanup?.stopInspecting();
      broadcastState();
      return { active: false };

    case "DELETE_ELEMENT": {
      const ref = cleanup ? cleanup.selected : null;
      const ok = ref !== null && cleanup ? cleanup.deleteTarget(ref) : false;
      broadcastState();
      return { success: ok };
    }

    case "HIDE_ELEMENT": {
      const ref = cleanup ? cleanup.selected : null;
      const ok = ref !== null && cleanup ? cleanup.hideTarget(ref) : false;
      broadcastState();
      return { success: ok };
    }

    case "SHOW_ELEMENT": {
      const ok = cleanup?.showSelected() ?? false;
      broadcastState();
      return { success: ok };
    }

    case "KEEP_ELEMENT": {
      const ref = cleanup ? cleanup.selected : null;
      const ok = ref !== null && cleanup ? cleanup.keepTarget(ref) : false;
      broadcastState();
      return { success: ok };
    }

    case "DELETE_MATCHING": {
      const ref = cleanup ? cleanup.selected : null;
      const count = ref !== null && cleanup ? cleanup.deleteSimilarTargets(ref) : 0;
      broadcastState();
      return { success: count > 0, data: { count } };
    }

    case "UNDO": {
      const ok = cleanup?.undo() ?? false;
      broadcastState();
      return { success: ok };
    }

    case "REDO": {
      const ok = cleanup?.redo() ?? false;
      broadcastState();
      return { success: ok };
    }

    case "UNDO_TO": {
      ensureRuntime();
      const undone = cleanup?.undoThrough(command.payload.entryId) ?? false;
      broadcastState();
      return { success: true, undone };
    }

    case "RESET": {
      const ok = cleanup?.reset() ?? false;
      broadcastState();
      return { success: ok };
    }

    case "APPLY_PRESET": {
      ensureRuntime();
      const preset = await presetRepository.get(command.payload.presetId);
      if (!preset) return { success: false, error: "Preset not found" };
      const count = cleanup?.applyPreset(preset) ?? 0;
      if (session) {
        session.preset.detected = true;
        session.preset.preset = preset;
        session.preset.applied = true;
      }
      broadcastState();
      return { success: true, count };
    }

    case "SAVE_PRESET": {
      ensureRuntime();
      if (!session || !cleanup) return { success: false, error: "No active session" };
      const state = cleanup.getState();
      // Skip rules that already came from a preset, otherwise saving a preset
      // on top of an auto-applied one would duplicate it.
      const rules = state.activeRules.filter((rule) => !rule.id.startsWith("rule-preset-"));
      if (rules.length === 0 && state.protectedTargets.length === 0) {
        return { success: false, error: "Nothing to save — remove or protect an element first" };
      }
      const now = Date.now();
      const siteHostname = session.page.hostname;
      // Saving again for the same site updates the existing preset instead of
      // duplicating it, and preserves its enabled flag (opt-in auto-apply).
      const existing = (await presetRepository.list()).find(
        (p) => normalizeHostname(p.site.hostname) === normalizeHostname(siteHostname),
      );
      const preset: SitePreset = {
        schemaVersion: SCHEMA_VERSION,
        id: existing?.id ?? createId("preset"),
        version: existing?.version ?? 1,
        // New presets ship disabled: nothing auto-applies until the user
        // explicitly enables it from the toolbar or the options page.
        enabled: existing?.enabled ?? false,
        site: { hostname: siteHostname },
        cleanup: {
          rules: rules.map((rule) => ({ ...rule, required: false })),
        },
        protection: {
          rules: state.protectedTargets.map((ref) => ({
            id: createId("protect"),
            selector: ref.selector,
            action: "KEEP",
            enabled: true,
          })),
        },
        metadata: {
          name: command.payload.name || existing?.metadata.name || session.page.hostname,
          author: existing?.metadata.author ?? "user",
          source: existing?.metadata.source ?? "USER_CREATED",
          createdAt: existing?.metadata.createdAt ?? now,
          updatedAt: now,
        },
      };
      await presetRepository.save(preset);
      if (session) {
        session.preset.detected = true;
        session.preset.preset = preset;
      }
      broadcastState();
      return { success: true, presetId: preset.id };
    }

    case "SET_PRESET_ENABLED": {
      ensureRuntime();
      const { presetId, enabled } = command.payload;
      const preset = await presetRepository.get(presetId);
      if (!preset) return { success: false, error: "Preset not found" };
      const next: SitePreset = {
        ...preset,
        enabled,
        metadata: { ...preset.metadata, updatedAt: Date.now() },
      };
      await presetRepository.save(next);
      // Enabling applies it right away; disabling only stops future auto-apply
      // (elements already cleaned this visit stay cleaned).
      if (enabled && cleanup) cleanup.applyPreset(next);
      if (session) {
        session.preset.detected = true;
        session.preset.preset = next;
        session.preset.applied = enabled;
      }
      broadcastState();
      return { success: true, data: { enabled } };
    }

    case "CAPTURE":
      return { success: false, error: "Capture orchestrated by Service Worker" };

    case "PREPARE_CAPTURE":
      // Remove any picker highlights and hide the toolbar so nothing that is
      // not part of the page shows up in the captured image.
      cleanup?.stopInspecting();
      overlay?.setVisible(false);
      broadcastState();
      return { success: true };

    case "RESTORE_CAPTURE":
      overlay?.setVisible(true);
      fixedHeaders.restoreAll();
      return { success: true };

    case "PREPARE_ELEMENT_CAPTURE": {
      ensureRuntime();
      const ref = cleanup?.selected;
      const element = ref && ref.id === command.payload.elementId ? document.querySelector<HTMLElement>(ref.selector) : null;
      if (!element || !element.isConnected) {
        return { success: false, error: "Selected element no longer exists" };
      }
      const metrics = elementCapture.isolate(element);
      if (metrics.rect.width <= 0 || metrics.rect.height <= 0) {
        elementCapture.restore();
        return { success: false, error: "Selected element has no visible area" };
      }

      // Scroll through the element's whole range so lazy media inside it loads
      // and paints before any slice is captured. A short pause per step lets
      // the browser's IntersectionObserver wake lazy images (which the images
      // were just flipped to eager in isolate(), but paint needs a tick too).
      const scroller = document.scrollingElement ?? document.documentElement;
      const maxScroll = Math.max(
        0,
        (scroller.scrollHeight || document.documentElement.scrollHeight) - metrics.viewportHeightCss,
      );
      for (const rel of planSlices(metrics.elementHeightCss, metrics.viewportHeightCss)) {
        const y = Math.min(metrics.elementDocTop + rel, maxScroll);
        scroller.scrollTop = y;
        window.scrollTo(0, y);
        void document.documentElement.getBoundingClientRect();
        await sleep(120);
      }
      await waitForElementRendering(element);

      // Re-measure after lazy images have loaded — they can grow the element.
      scroller.scrollTop = metrics.elementDocTop;
      window.scrollTo(0, metrics.elementDocTop);
      void document.documentElement.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const finalMetrics = {
        dpr: metrics.dpr,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        elementDocTop: metrics.elementDocTop,
        elementHeightCss: rect.height,
        viewportHeightCss: metrics.viewportHeightCss,
      };
      if (finalMetrics.elementHeightCss <= 0) {
        elementCapture.restore();
        return { success: false, error: "Selected element has no visible area" };
      }
      if (exceedsCanvasLimit(finalMetrics.elementHeightCss, finalMetrics.dpr)) {
        elementCapture.restore();
        return {
          success: false,
          tooTall: true,
          error: `Element is too tall for capture (max ${MAX_CANVAS_DIMENSION}px)`,
        };
      }

      stitcher?.dispose();
      stitcher = new DefaultCaptureStitcher();
      stitcher.start(finalMetrics.elementHeightCss, finalMetrics.dpr, finalMetrics.elementDocTop);
      const pendingImgs = Array.from(
        element instanceof HTMLImageElement ? [element] : element.querySelectorAll("img"),
      ).filter((img) => !img.complete).length;
      console.debug("[parotia] element capture prepared", {
        tag: element.tagName.toLowerCase(),
        rect: finalMetrics.rect,
        dpr: finalMetrics.dpr,
        elementHeightCss: finalMetrics.elementHeightCss,
        pendingImages: pendingImgs,
      });
      return { success: true, ...finalMetrics };
    }

    case "CAPTURE_ELEMENT_SCROLL": {
      const scroller = document.scrollingElement ?? document.documentElement;
      scroller.scrollTop = command.payload.scrollYCss;
      window.scrollTo(0, command.payload.scrollYCss);
      // Force a synchronous reflow so the new scroll position is painted
      // before the Service Worker captures the viewport.
      void document.documentElement.getBoundingClientRect();
      return { success: true, actualScrollY: window.scrollY };
    }

    case "CAPTURE_ELEMENT_SLICE": {
      if (!stitcher) return { success: false, error: "Element capture not started" };
      try {
        await stitcher.addSlice(command.payload.dataUrl, command.payload.scrollYCss);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    case "CAPTURE_ELEMENT_FINALIZE": {
      if (!stitcher) return { success: false, error: "Element capture not started" };
      try {
        let dataUrl = await stitcher.finalize();
        // The stitched canvas is as wide as the captured viewport; crop it to
        // the element's horizontal bounds so narrow elements (e.g. a tweet in
        // a side column) have no empty space on their left and right.
        const { dpr, rect } = command.payload;
        if (dpr > 0 && rect && rect.width > 0) {
          const bitmap = await loadBitmap(dataUrl);
          const vpWidth = bitmap.width;
          const vpHeight = bitmap.height;
          bitmap.close();
          const x = Math.max(0, Math.round(rect.left * dpr));
          const width = Math.max(1, Math.min(vpWidth - x, Math.round(rect.width * dpr)));
          if (x > 0 || width < vpWidth) {
            dataUrl = await cropDataUrlToPng(dataUrl, { x, y: 0, width, height: vpHeight });
          }
        }
        try {
          // The image may be too large for chrome messaging; stage it in
          // chrome.storage.local (unlimitedStorage) for the worker to download.
          await chrome.storage.local.set({ [`elementcapture:${command.payload.sessionId}`]: dataUrl });
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: `Failed to stage element image in storage: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        stitcher.dispose();
        stitcher = null;
      }
    }

    case "CAPTURE_ELEMENT_RESTORE":
      elementCapture.restore();
      return { success: true };

    case "CAPTURE_STITCH_START": {
      ensureRuntime();
      const pageHeightCss = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      );
      const viewportHeightCss = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const scrollY = window.scrollY;
      fixedHeaders.reset();
      const fixedHeaderCount = fixedHeaders.detect();
      stitcher?.dispose();
      stitcher = new DefaultCaptureStitcher();
      stitcher.start(pageHeightCss, dpr);
      return {
        success: true,
        metrics: { pageHeightCss, viewportHeightCss, dpr, scrollY, fixedHeaders: fixedHeaderCount },
      };
    }

    case "CAPTURE_SCROLL": {
      const target = command.payload.scrollYCss;
      const scroller = document.scrollingElement ?? document.documentElement;
      scroller.scrollTop = target;
      window.scrollTo(0, target);
      // Only the first slice (the top of the image) keeps the fixed header.
      if (target > 0) fixedHeaders.hideAll();
      // Force a synchronous reflow so the new scroll position is painted
      // before the Service Worker captures the viewport.
      void document.documentElement.getBoundingClientRect();
      return { success: true, actualScrollY: window.scrollY };
    }

    case "CAPTURE_SLICE": {
      if (!stitcher) return { success: false, error: "Stitcher not started" };
      await stitcher.addSlice(command.payload.dataUrl, command.payload.scrollYCss);
      return { success: true };
    }

    case "CAPTURE_FINALIZE": {
      if (!stitcher) return { success: false, error: "Stitcher not started" };
      try {
        const dataUrl = await stitcher.finalize();
        try {
          // The image may be too large for chrome messaging; stage it in
          // chrome.storage.local (unlimitedStorage) for the worker to download.
          await chrome.storage.local.set({ [`capture:${command.payload.sessionId}`]: dataUrl });
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: `Failed to stage image in storage: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } finally {
        stitcher.dispose();
        stitcher = null;
        fixedHeaders.restoreAll();
      }
    }

    case "GET_STATE":
      return getSnapshot();
  }
}

function getSnapshot() {
  if (!session || !cleanup) return null;
  return {
    sessionId: session.id,
    status: session.status,
    freeze: freeze.getState(),
    cleanup: cleanup.getState(),
    extraction: extraction.getState(),
    preset: presetSummary(),
    actionLog: actionLogState(),
    history: historyState(),
  };
}

/**
 * Payload validation at the content boundary. Every command except START_SESSION
 * must carry the id of the session this page owns; a command for a different
 * (or absent) session is stale — e.g. after the toolbar re-synced a dead
 * session — and is rejected before any DOM side effect.
 */
function validatePayload(command: BackgroundCommand): string | null {
  if (command.type === "START_SESSION") return null;
  const payload = command.payload as { sessionId?: unknown };
  if (typeof payload.sessionId !== "string" || payload.sessionId === "") {
    return "Missing or invalid sessionId";
  }
  if (session && payload.sessionId !== session.id) {
    return "Session mismatch";
  }
  return null;
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isBackgroundCommand(message)) return false;
  const command = message as BackgroundCommand;
  const id = (message as { id?: string }).id ?? "";
  void handleCommand(command).then(
    (data) => sendResponse({ id, success: true, data }),
    (error: Error) => {
      console.error("[parotia] command failed", command.type, error);
      sendResponse({ id, success: false, error: { code: "INTERNAL", message: error.message } });
    },
  );
  return true; // async response
});

// PING keeps injection checks cheap; respond immediately.
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const ping = message as { type?: string };
  if (ping?.type === "PING") {
    sendResponse({ id: "", success: true, data: { injected: true } });
    return false;
  }
  return false;
});

export {};
