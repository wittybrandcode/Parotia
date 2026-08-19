import type {
  ActionLogEntry,
  BackgroundCommand,
  CleanupState,
  FreezeState,
  NewsCleanSession,
} from "@shared/types";
import { isBackgroundCommand, isBackgroundNotification } from "@shared/types";
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
import { forceEagerImages, preRollForCapture, waitForImagesReady } from "./capture/preload";
import { KeyboardShortcuts } from "./keyboard/shortcuts";
import { startFreeSelect } from "./selection/freeSelect";
import { createId } from "@shared/utils/id";

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

const history = new HistoryEngine();
const mutations = new DefaultMutationEngine(history);
const freeze = new DefaultFreezeEngine();
const extraction = new DefaultExtractionEngine();
const elementCapture = new ElementCaptureIsolator();

/**
 * Pending "Delete Similar" confirmations. The first click previews the matches
 * and issues a short-lived token; the second click confirms with that token so
 * a stale confirm can never delete a different (changed) set of elements.
 */
const deleteSimilarPreviews = new Map<string, { signatures: string[]; expires: number }>();
let deleteSimilarToken: string | null = null;
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
          payload: {
            sessionId: session?.id ?? "",
            elementId: cleanup?.selected?.id ?? "",
            // A pending preview means this click is the confirmation.
            ...(deleteSimilarToken ? { confirm: true, token: deleteSimilarToken } : {}),
          },
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

/** Pushes the latest state to the toolbar iframe (which talks to the page). */
function broadcastState(): void {
  if (!session || !overlay) return;
  const state = {
    sessionId: session.id,
    freeze: freeze.getState() as FreezeState,
    cleanup: cleanup?.getState() as CleanupState | undefined,
    status: session.status,
    actionLog: actionLogState(),
    history: historyState(),
  };
  const frame = overlay.shadow.querySelector<HTMLIFrameElement>("iframe[data-newsclean-frame]");
  // Target the extension origin explicitly instead of "*": STATE is only ever
  // delivered to the NewsClean toolbar iframe and never to other windows.
  const targetOrigin = new URL(chrome.runtime.getURL("")).origin;
  frame?.contentWindow?.postMessage({ source: "newsclean-content", type: "STATE", state }, targetOrigin);
}

/** Relays Service Worker progress (capture) to the toolbar iframe. */
function broadcastProgress(progress: { current: number; total: number; phase: string }): void {
  const frame = overlay?.shadow.querySelector<HTMLIFrameElement>("iframe[data-newsclean-frame]");
  const targetOrigin = new URL(chrome.runtime.getURL("")).origin;
  frame?.contentWindow?.postMessage({ source: "newsclean-content", type: "PROGRESS", progress }, targetOrigin);
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
      broadcastState();
      return getSnapshot();

    case "FREEZE_PAGE": {
      ensureRuntime();
      // Session stays ACTIVE while freezing; the freeze sub-state tracks FROZEN.
      const result = await freeze.freeze(command.payload.strategy);
      // While frozen, the page can still re-render deleted/hidden elements
      // (injected scripts, rAF loops). Guard those signatures so the user's
      // cleanup decisions survive re-renders.
      if (result.success) mutations.startRegenerationGuard();
      broadcastState();
      return result;
    }

    case "UNFREEZE_PAGE":
      mutations.stopRegenerationGuard();
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

    case "DELETE_MATCHING": {
      const ref = cleanup ? cleanup.selected : null;
      if (!ref || !cleanup) return { success: false, error: "No element selected" };

      if (command.payload.confirm) {
        const token = command.payload.token ?? "";
        const preview = deleteSimilarPreviews.get(token);
        deleteSimilarPreviews.delete(token);
        deleteSimilarToken = null;
        if (!preview || Date.now() > preview.expires) {
          cleanup.clearPreview();
          cleanup.setDeleteSimilarPreview(null);
          return { success: false, error: "Preview expired — pick the element and try again" };
        }
        const count = cleanup.confirmDeleteSimilar(ref, preview.signatures);
        cleanup.setDeleteSimilarPreview(null);
        broadcastState();
        return { success: count > 0, data: { count } };
      }

      // Preview mode: show what would be removed and issue a confirmation token.
      const preview = cleanup.previewSimilarTargets(ref);
      if (!preview || preview.count === 0) {
        cleanup.clearPreview();
        cleanup.setDeleteSimilarPreview(null);
        return { success: false, error: "No similar elements found" };
      }
      const token = createId("preview");
      deleteSimilarPreviews.set(token, { signatures: preview.signatures, expires: Date.now() + 60_000 });
      deleteSimilarToken = token;
      cleanup.showPreview(preview.elements);
      cleanup.setDeleteSimilarPreview(preview.count);
      return { success: true, data: { count: preview.count, token, previewActive: true } };
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
        const { blank } = await stitcher.addSlice(command.payload.dataUrl, command.payload.scrollYCss);
        return { success: true, blank };
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

    case "FREE_SELECT": {
      ensureRuntime();
      cleanup?.stopInspecting();
      const regionResult = await startFreeSelect();
      if (!regionResult) return { success: false, cancelled: true };
      return { success: true, rect: regionResult.rect, scrollY: regionResult.scrollY, dpr: regionResult.dpr };
    }

    case "CAPTURE_REGION_CROP": {
      try {
        const { dataUrl, rect, dpr } = command.payload;
        const cropX = Math.max(0, Math.round(rect.x * dpr));
        const cropY = Math.max(0, Math.round(rect.y * dpr));
        const cropW = Math.max(1, Math.round(rect.width * dpr));
        const cropH = Math.max(1, Math.round(rect.height * dpr));
        const cropped = await cropDataUrlToPng(dataUrl, { x: cropX, y: cropY, width: cropW, height: cropH });
        try {
          await chrome.storage.local.set({ [`regioncapture:${command.payload.sessionId}`]: cropped });
          return { success: true };
        } catch (error) {
          return { success: false, error: `Failed to stage region image: ${error instanceof Error ? error.message : String(error)}` };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    case "CAPTURE_STITCH_START": {
      ensureRuntime();
      // Lazy images far from the viewport would render as white gaps. Pre-roll
      // the page once so the browser fetches them, promote lazy placeholders to
      // eager, and wait until every image is painted before measuring.
      const originalScrollY = window.scrollY;
      await preRollForCapture(originalScrollY);
      forceEagerImages(document);
      await waitForImagesReady(document);
      const pageHeightCss = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      );
      const viewportHeightCss = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const scrollY = originalScrollY;
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
      const { blank } = await stitcher.addSlice(command.payload.dataUrl, command.payload.scrollYCss);
      return { success: true, blank };
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

    case "CLOSE_TOOLBAR": {
      mutations.stopRegenerationGuard();
      deleteSimilarPreviews.clear();
      deleteSimilarToken = null;
      cleanup?.stopInspecting();
      overlay?.destroy();
      overlay = null;
      session = null;
      cleanup = null;
      return { success: true };
    }

    case "SELECT_REGION":
      return { success: false, error: "Handled by Service Worker" };

    default: {
      const _: never = command;
      return _;
    }
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

// Push notifications from the Service Worker (never commands): relay capture
// progress to the toolbar so it can render live progress instead of a spinner.
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isBackgroundNotification(message)) return false;
  broadcastProgress(message.payload.progress);
  return false;
});

export {};
