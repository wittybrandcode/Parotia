import type { BackgroundCommand, MessageResponse } from "@shared/types";
import { isBackgroundCommand } from "@shared/types";
import { sanitizeFilenamePart, timestampPart } from "@shared/utils/filename";
import { MAX_CANVAS_DIMENSION, exceedsCanvasLimit, planSlices } from "@content/capture/sliceMath";

/**
 * Parotia service worker.
 * Owns: extension lifecycle, toolbar activation, tab communication, runtime
 * messaging, storage coordination. Must NEVER directly manipulate the webpage DOM.
 *
 * MV3: this worker is event-driven and may be stopped when idle. Runtime
 * state must be reconstructable (sessions are re-created from the tab, and
 * persistent config lives in chrome.storage.local).
 */

/** Tracks the live session id for each tab. Rebuilt on tab start via START_SESSION. */
const tabSessions = new Map<number, string>();

const CONTENT_SCRIPT = "content/index.js";

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  return tab;
}

/** Reverse lookup: which tab owns the given session? (toolbar iframes send no sender.tab). */
function findTabForSession(sessionId: string): number | undefined {
  for (const [tabId, id] of tabSessions) {
    if (id === sessionId) return tabId;
  }
  return undefined;
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING", payload: {} });
  } catch {
    // Content script not present yet — inject it.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT],
    });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await ensureContentScriptInjected(tab.id);
  await chrome.tabs.sendMessage(tab.id, {
    type: "START_SESSION",
    payload: {},
  } satisfies BackgroundCommand);
});

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    const id = typeof (message as { id?: unknown })?.id === "string" ? (message as { id: string }).id : "";
    if (!isBackgroundCommand(message)) {
      sendResponse({ id, success: false, error: { code: "UNKNOWN_COMMAND", message: "Unknown command" } });
      return false;
    }

    const cmd = message as BackgroundCommand;
    void dispatch(cmd, sender, id).then(
      (response) => sendResponse(response),
      (error: Error) =>
        sendResponse({
          id,
          success: false,
          error: { code: "INTERNAL", message: error.message },
        }),
    );
    return true; // async response
  },
);

/**
 * Resolves the target tab for a command and runs it. The response always
 * echoes the request's correlation `id` so the toolbar can pair replies.
 */
async function dispatch(
  command: BackgroundCommand,
  sender: chrome.runtime.MessageSender,
  id: string,
): Promise<MessageResponse> {
  const invalid = validatePayload(command);
  if (invalid) return { id, success: false, error: { code: "INVALID_PAYLOAD", message: invalid } };

  // Toolbar iframes are extension pages, so sender.tab is undefined. Resolve
  // the target tab from the session id when that is the case.
  const sessionId = (command.payload as { sessionId?: string }).sessionId;
  const tabId = sender.tab?.id ?? (typeof sessionId === "string" ? findTabForSession(sessionId) : undefined);

  if (command.type !== "START_SESSION") {
    if (typeof sessionId !== "string" || sessionId === "" || tabId === undefined) {
      if (typeof sessionId !== "string" || sessionId === "") {
        return { id, success: false, error: { code: "INVALID_PAYLOAD", message: "Missing or invalid sessionId" } };
      }
      // MV3 stops the worker when idle; on wake-up the in-memory session map is
      // gone even though the page session survived. Re-register it with the
      // content script in the active tab (the toolbar's overlay lives there),
      // then retry with the freshly confirmed session id.
      const recovered = await recoverTabForSession();
      if (recovered === null) {
        return { id, success: false, error: { code: "SESSION_NOT_FOUND", message: "Session not found" } };
      }
      const [recoveredTabId, freshSessionId] = recovered;
      const routed =
        freshSessionId === sessionId
          ? command
          : ({ ...command, payload: { ...command.payload, sessionId: freshSessionId } } as BackgroundCommand);
      return routeToTab(recoveredTabId, routed);
    }
  }

  try {
    const data = await handleCommand(command, tabId);
    return { id, success: true, data };
  } catch (error) {
    return { id, success: false, error: { code: "INTERNAL", message: error instanceof Error ? error.message : String(error) } };
  }
}

/**
 * Re-registers the session after a worker restart: START_SESSION is
 * idempotent in the content script (it returns the existing page session), so
 * this restores the worker's session map without losing state.
 */
async function recoverTabForSession(): Promise<[number, string] | null> {
  try {
    const tab = await getActiveTab();
    if (tab.id === undefined) return null;
    await ensureContentScriptInjected(tab.id);
    const res = (await chrome.tabs.sendMessage(tab.id, {
      type: "START_SESSION",
      payload: {},
    } satisfies BackgroundCommand)) as MessageResponse<{ sessionId?: string }> | undefined;
    const fresh = res?.data?.sessionId;
    if (typeof fresh !== "string" || fresh === "") return null;
    tabSessions.set(tab.id, fresh);
    return [tab.id, fresh];
  } catch {
    return null;
  }
}

/**
 * Runtime payload validation at the worker boundary: malformed commands are
 * rejected before any side effect (messaging, capture, storage).
 */
function validatePayload(command: BackgroundCommand): string | null {
  const payload = command.payload as Record<string, unknown>;
  if (command.type !== "START_SESSION") {
    const sessionId = payload.sessionId;
    if (typeof sessionId !== "string" || sessionId === "") return "Missing or invalid sessionId";
  }
  switch (command.type) {
    case "DELETE_ELEMENT":
    case "HIDE_ELEMENT":
    case "SHOW_ELEMENT":
    case "KEEP_ELEMENT":
    case "DELETE_MATCHING":
    case "PREPARE_ELEMENT_CAPTURE":
      if (typeof payload.elementId !== "string" || payload.elementId === "") return "Missing or invalid elementId";
      break;
    case "CAPTURE": {
      if (payload.mode !== "VISIBLE" && payload.mode !== "FULL_PAGE" && payload.mode !== "ELEMENT") {
        return "Invalid capture mode";
      }
      if (payload.mode === "ELEMENT" && (typeof payload.elementId !== "string" || payload.elementId === "")) {
        return "Missing or invalid elementId";
      }
      break;
    }
    case "UNDO_TO":
      if (typeof payload.entryId !== "string" || payload.entryId === "") return "Missing or invalid entryId";
      break;
    case "APPLY_PRESET":
    case "SET_PRESET_ENABLED":
      if (typeof payload.presetId !== "string" || payload.presetId === "") return "Missing or invalid presetId";
      if (command.type === "SET_PRESET_ENABLED" && typeof payload.enabled !== "boolean") return "Invalid enabled flag";
      break;
    case "SAVE_PRESET":
      if (payload.name !== undefined && typeof payload.name !== "string") return "Invalid name";
      break;
    case "CAPTURE_SCROLL":
    case "CAPTURE_ELEMENT_SCROLL":
      if (typeof payload.scrollYCss !== "number" || !Number.isFinite(payload.scrollYCss)) {
        return "Invalid scrollYCss";
      }
      break;
    case "CAPTURE_SLICE":
    case "CAPTURE_ELEMENT_SLICE":
      if (typeof payload.dataUrl !== "string" || payload.dataUrl === "") return "Missing or invalid dataUrl";
      if (typeof payload.scrollYCss !== "number" || !Number.isFinite(payload.scrollYCss)) {
        return "Invalid scrollYCss";
      }
      break;
    default:
      break;
  }
  return null;
}

async function handleCommand(command: BackgroundCommand, tabId: number | undefined) {
  switch (command.type) {
    case "START_SESSION": {
      const tab = await getActiveTab();
      if (tab.id === undefined) throw new Error("No active tab");
      await ensureContentScriptInjected(tab.id);
      const response = (await chrome.tabs.sendMessage(tab.id, command)) as MessageResponse | undefined;
      const sessionId = (response?.data as { sessionId?: string } | undefined)?.sessionId;
      if (typeof sessionId === "string" && sessionId !== "") {
        tabSessions.set(tab.id, sessionId);
      }
      return response;
    }
    case "FREEZE_PAGE":
    case "UNFREEZE_PAGE":
    case "INSPECT_START":
    case "INSPECT_STOP":
    case "DELETE_ELEMENT":
    case "HIDE_ELEMENT":
    case "SHOW_ELEMENT":
    case "KEEP_ELEMENT":
    case "DELETE_MATCHING":
    case "UNDO":
    case "REDO":
    case "UNDO_TO":
    case "RESET":
    case "APPLY_PRESET":
    case "SAVE_PRESET":
    case "SET_PRESET_ENABLED":
    case "GET_STATE":
      return routeToTab(tabId, command);
    case "CAPTURE": {
      const capture = command as Extract<BackgroundCommand, { type: "CAPTURE" }>;
      if (capture.payload.mode === "FULL_PAGE") return captureFullPage(tabId, capture);
      if (capture.payload.mode === "ELEMENT") return captureElement(tabId, capture);
      return captureVisibleArea(tabId, capture);
    }
    case "PREPARE_CAPTURE":
    case "RESTORE_CAPTURE":
    case "PREPARE_ELEMENT_CAPTURE":
    case "CAPTURE_ELEMENT_SCROLL":
    case "CAPTURE_ELEMENT_SLICE":
    case "CAPTURE_ELEMENT_FINALIZE":
    case "CAPTURE_ELEMENT_RESTORE":
    case "CAPTURE_STITCH_START":
    case "CAPTURE_SCROLL":
    case "CAPTURE_SLICE":
    case "CAPTURE_FINALIZE":
      return routeToTab(tabId, command);
    default: {
      const exhaustive: never = command;
      throw new Error(`Unhandled command: ${exhaustive}`);
    }
  }
}

// Chrome rate-limits captureVisibleTab to ~2 frames/sec; give each scroll
// position time to paint and the capture throttle time to settle.
const PAINT_SETTLE_MS = 450;

type CaptureCommand = Extract<BackgroundCommand, { type: "CAPTURE" }>;

/** Hides the Parotia toolbar so it never appears in a captured image. */
async function hideToolbar(tabId: number, sessionId: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PREPARE_CAPTURE",
      payload: { sessionId },
    } satisfies BackgroundCommand);
  } catch {
    // Content script unavailable — capture whatever is visible.
  }
}

async function showToolbar(tabId: number, sessionId: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "RESTORE_CAPTURE",
      payload: { sessionId },
    } satisfies BackgroundCommand);
  } catch {
    // Best effort; the toolbar may already be gone with the tab.
  }
}

/** Sanitized page-title basename — can never contain separators or reserved chars. */
function titleSlug(tab: chrome.tabs.Tab): string {
  return sanitizeFilenamePart(tab.title ?? "");
}

/** Captures the currently visible viewport and downloads it as a PNG. */
async function captureVisibleArea(tabId: number | undefined, command: CaptureCommand): Promise<unknown> {
  if (tabId === undefined) throw new Error("No tab context for command");
  const { sessionId } = command.payload;
  const tab = await chrome.tabs.get(tabId);

  await hideToolbar(tabId, sessionId);
  try {
    await sleep(PAINT_SETTLE_MS);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const filename = `parotia-${titleSlug(tab)}-${timestampPart()}.png`;
    const downloaded = await downloadPng(dataUrl, filename);
    if (!downloaded) return { success: false, error: DOWNLOAD_PERMISSION_MESSAGE };
    return { success: true, filename };
  } finally {
    await showToolbar(tabId, sessionId);
  }
}

/**
 * Captures the whole page from top to bottom: the content script measures the
 * page and reports the real scroll position after each jump; the worker
 * captures each viewport and the content script stitches the slices together.
 */
async function captureFullPage(tabId: number | undefined, command: CaptureCommand): Promise<unknown> {
  if (tabId === undefined) throw new Error("No tab context for command");
  const { sessionId } = command.payload;
  const tab = await chrome.tabs.get(tabId);
  let originalScrollY = 0;
  const steps: string[] = [];

  await hideToolbar(tabId, sessionId);
  try {
    const startRes = (await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_STITCH_START",
      payload: { sessionId },
    } satisfies BackgroundCommand)) as
      | MessageResponse<{
          success?: boolean;
          metrics?: {
            pageHeightCss: number;
            viewportHeightCss: number;
            dpr: number;
            scrollY: number;
            fixedHeaders?: number;
          };
        }>
      | undefined;

    const startData = startRes?.data;
    const metrics = startData?.metrics;
    if (!startData?.success || !metrics || metrics.pageHeightCss <= 0) {
      const detail =
        (startRes?.error?.message ?? "") ||
        (startData && typeof startData === "object" && "error" in startData
          ? String((startData as { error?: { message?: string } }).error?.message ?? "")
          : "");
      const raw = startRes === undefined ? " (no response from content script)" : "";
      console.error("[parotia] CAPTURE_STITCH_START failed", startRes);
      throw new Error(`Could not measure the page${detail ? `: ${detail}` : ""}${raw}`);
    }
    steps.push(`measured ${Math.round(metrics.pageHeightCss)}px`);
    if (metrics.fixedHeaders) steps.push(`${metrics.fixedHeaders} fixed header(s)`);
    originalScrollY = metrics.scrollY;
    if (exceedsCanvasLimit(metrics.pageHeightCss, metrics.dpr)) {
      return {
        success: false,
        error: `Page is too tall for full-page capture (max ${MAX_CANVAS_DIMENSION}px)`,
      };
    }

    const scrollTo = async (y: number): Promise<number> => {
      const res = (await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_SCROLL",
        payload: { sessionId, scrollYCss: y },
      } satisfies BackgroundCommand)) as
        | MessageResponse<{ success?: boolean; actualScrollY?: number }>
        | undefined;
      return typeof res?.data?.actualScrollY === "number" ? res.data.actualScrollY : y;
    };

    const maxScroll = Math.max(0, metrics.pageHeightCss - metrics.viewportHeightCss);
    const scrollYs = planSlices(metrics.pageHeightCss, metrics.viewportHeightCss);
    for (const y of scrollYs) {
      const actualY = await scrollTo(Math.min(y, maxScroll));
      await sleep(PAINT_SETTLE_MS);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_SLICE",
        payload: { sessionId, dataUrl, scrollYCss: actualY },
      } satisfies BackgroundCommand);
    }
    steps.push(`captured ${scrollYs.length} slices`);

    const result = (await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_FINALIZE",
      payload: { sessionId },
    } satisfies BackgroundCommand)) as
      | MessageResponse<{ success?: boolean; error?: { message?: string } }>
      | undefined;

    if (!result?.data?.success) {
      const detail = result?.data?.error?.message ?? result?.error?.message ?? "";
      throw new Error(`Failed to assemble the full-page image${detail ? `: ${detail}` : ""}`);
    }
    steps.push("assembled");

    const key = `capture:${sessionId}`;
    const stored = await chrome.storage.local.get(key);
    const dataUrl = stored?.[key];
    if (typeof dataUrl !== "string") {
      throw new Error("Full-page image missing from storage");
    }
    await chrome.storage.local.remove(key);

    const filename = `parotia-fullpage-${titleSlug(tab)}-${timestampPart()}.png`;
    const downloaded = await downloadPng(dataUrl, filename);
    if (!downloaded) return { success: false, error: DOWNLOAD_PERMISSION_MESSAGE, steps };
    steps.push("downloaded");
    return { success: true, filename, steps };
  } catch (error) {
    throw new Error(`Capture failed [${steps.join(" > ") || "start"}]: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await scrollTab(tabId, originalScrollY);
    await showToolbar(tabId, sessionId);
  }
}

/**
 * Downloads a PNG from a data URL (blob: URLs are unavailable in MV3 service
 * workers). `downloads` is optional, so the permission is requested on first
 * export; when it cannot be granted the capture still succeeds and the toolbar
 * shows the message below instead of the exported image.
 */
const DOWNLOAD_PERMISSION_MESSAGE =
  "Export permission unavailable — enable the downloads permission and try again.";

async function ensureDownloadsPermission(): Promise<boolean> {
  try {
    if (await chrome.permissions.contains({ permissions: ["downloads"] })) return true;
    return await chrome.permissions.request({ permissions: ["downloads"] });
  } catch {
    return false;
  }
}

async function downloadPng(dataUrl: string, filename: string): Promise<boolean> {
  if (!(await ensureDownloadsPermission())) return false;
  try {
    await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Captures the picked element as a standalone PNG. The content script isolates
 * the element (hiding everything else), forces its lazy media to load, and
 * starts a stitcher over the element's height; the worker then scrolls the
 * element through the viewport one slice at a time, captures each viewport,
 * and the content script stitches them into a single element-sized image and
 * crops out the empty space on the element's sides. Elements taller than the
 * viewport are captured in full, and fixed headers are hidden by the isolation
 * so they never cover the element's top.
 *
 * Quality: captureVisibleTab is capped at the device resolution, so to render
 * the element at higher fidelity the tab is temporarily zoomed in (2x) for the
 * duration of the capture — each CSS px then covers more device px. If that
 * pushes the element past the canvas size limit, the capture retries at the
 * original zoom.
 */
async function captureElement(tabId: number | undefined, command: CaptureCommand): Promise<unknown> {
  if (tabId === undefined) throw new Error("No tab context for command");
  const { sessionId, elementId } = command.payload;
  if (!elementId) return { success: false, error: "No element selected for capture" };
  const tab = await chrome.tabs.get(tabId);
  const steps: string[] = [];

  interface ElementPrepData {
    success?: boolean;
    tooTall?: boolean;
    dpr?: number;
    rect?: { left: number; top: number; width: number; height: number };
    elementDocTop?: number;
    elementHeightCss?: number;
    viewportHeightCss?: number;
    error?: { message?: string };
  }

  const sendPrepare = async (): Promise<ElementPrepData | undefined> => {
    const res = (await chrome.tabs.sendMessage(tabId, {
      type: "PREPARE_ELEMENT_CAPTURE",
      payload: { sessionId, elementId },
    } satisfies BackgroundCommand)) as MessageResponse<ElementPrepData> | undefined;
    return res?.data;
  };

  await hideToolbar(tabId, sessionId);
  const originalZoom = await chrome.tabs.getZoom(tabId).catch(() => 1);
  // Double the effective resolution for crisper element captures.
  const targetZoom = Math.min(5, Math.max(1, originalZoom * 2));
  const zoomChanged = Math.abs(targetZoom - originalZoom) > 0.05;

  try {
    if (zoomChanged) {
      try {
        await chrome.tabs.setZoom(tabId, targetZoom);
        await sleep(PAINT_SETTLE_MS);
        steps.push(`zoomed to ${targetZoom.toFixed(2)}x`);
      } catch {
        // Zoom unavailable — capture at the original resolution.
      }
    }

    let prep = await sendPrepare();
    // A higher zoom doubles the element's pixel height; if that exceeds the
    // canvas limit, fall back to the original resolution before giving up.
    if (!prep?.success && prep?.tooTall && zoomChanged) {
      try {
        await chrome.tabs.setZoom(tabId, originalZoom);
        await sleep(PAINT_SETTLE_MS);
      } catch {
        // Ignore — prep will fail again and surface the real error.
      }
      prep = await sendPrepare();
    }

    if (!prep?.success || !prep.elementHeightCss || prep.elementHeightCss <= 0) {
      const detail =
        (prep && typeof prep === "object" && "error" in prep
          ? String((prep as { error?: { message?: string } }).error?.message ?? "")
          : "") || "";
      throw new Error(`Could not prepare the element for capture${detail ? `: ${detail}` : ""}`);
    }
    steps.push("isolated element");

    const dpr = prep.dpr ?? 1;
    const rect = prep.rect ?? { left: 0, top: 0, width: 0, height: 0 };
    const elementDocTop = prep.elementDocTop ?? 0;
    const elementHeightCss = prep.elementHeightCss;
    const viewportHeightCss = prep.viewportHeightCss ?? 0;
    if (viewportHeightCss <= 0) throw new Error("Could not determine the viewport size");
    if (exceedsCanvasLimit(elementHeightCss, dpr)) {
      return {
        success: false,
        error: `Element is too tall for capture (max ${MAX_CANVAS_DIMENSION}px)`,
      };
    }

    const scrollTo = async (y: number): Promise<number> => {
      const res = (await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_ELEMENT_SCROLL",
        payload: { sessionId, scrollYCss: y },
      } satisfies BackgroundCommand)) as
        | MessageResponse<{ success?: boolean; actualScrollY?: number }>
        | undefined;
      return typeof res?.data?.actualScrollY === "number" ? res.data.actualScrollY : y;
    };

    const relYs = planSlices(elementHeightCss, viewportHeightCss);
    for (const rel of relYs) {
      const actualY = await scrollTo(elementDocTop + rel);
      await sleep(PAINT_SETTLE_MS);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_ELEMENT_SLICE",
        payload: { sessionId, dataUrl, scrollYCss: actualY },
      } satisfies BackgroundCommand);
    }
    steps.push(`captured ${relYs.length} slice(s)`);

    const result = (await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_ELEMENT_FINALIZE",
      payload: { sessionId, dpr, rect },
    } satisfies BackgroundCommand)) as
      | MessageResponse<{ success?: boolean; error?: { message?: string } }>
      | undefined;

    if (!result?.data?.success) {
      const detail = result?.data?.error?.message ?? result?.error?.message ?? "";
      throw new Error(`Failed to assemble the element image${detail ? `: ${detail}` : ""}`);
    }
    steps.push("assembled");

    const key = `elementcapture:${sessionId}`;
    const stored = await chrome.storage.local.get(key);
    const cropped = stored?.[key];
    if (typeof cropped !== "string") {
      throw new Error("Element image missing from storage");
    }
    await chrome.storage.local.remove(key);

    const filename = `parotia-element-${titleSlug(tab)}-${timestampPart()}.png`;
    const downloaded = await downloadPng(cropped, filename);
    if (!downloaded) return { success: false, error: DOWNLOAD_PERMISSION_MESSAGE, steps };
    steps.push("downloaded");
    return { success: true, filename, steps };
  } catch (error) {
    throw new Error(
      `Element capture failed [${steps.join(" > ") || "start"}]: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_ELEMENT_RESTORE",
        payload: { sessionId },
      } satisfies BackgroundCommand);
    } catch {
      // Content script may be gone; the toolbar restore below is best effort too.
    }
    if (zoomChanged) {
      try {
        await chrome.tabs.setZoom(tabId, originalZoom);
      } catch {
        // Ignore — the tab zoom is best-effort to restore.
      }
    }
    await showToolbar(tabId, sessionId);
  }
}

async function scrollTab(tabId: number, y: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_SCROLL",
      payload: { sessionId: "", scrollYCss: y },
    } satisfies BackgroundCommand);
  } catch {
    // Content script may be gone; nothing to restore.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function routeToTab(tabId: number | undefined, command: BackgroundCommand) {
  if (tabId === undefined) throw new Error("No tab context for command");
  return chrome.tabs.sendMessage(tabId, command);
}

// Sessions end with their tab; drop tracking on close.
chrome.tabs.onRemoved.addListener((tabId) => {
  tabSessions.delete(tabId);
});

export { tabSessions };
