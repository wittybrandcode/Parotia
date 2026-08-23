import type { BackgroundCommand, BackgroundNotification, CaptureProgress } from "@shared/types";
import { sleep } from "@shared/utils/imageCodec";
import { sanitizeFilenamePart } from "@shared/utils/filename";
import { logger } from "@shared/utils/logger";

// Chrome rate-limits captureVisibleTab to ~2 frames/sec; give each scroll
// position time to paint and the capture throttle time to settle.
export const PAINT_SETTLE_MS = 450;

export type CaptureCommand = Extract<BackgroundCommand, { type: "CAPTURE" }>;

/** Pushes live capture progress to the toolbar (SW → content → UI). Best effort. */
export function pushProgress(tabId: number, sessionId: string, progress: CaptureProgress): void {
  void chrome.tabs.sendMessage(tabId, {
    type: "CAPTURE_PROGRESS",
    payload: { sessionId, progress },
  } satisfies BackgroundNotification);
}

/** Hides the Parotia toolbar so it never appears in a captured image. */
export async function hideToolbar(tabId: number, sessionId: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PREPARE_CAPTURE",
      payload: { sessionId },
    } satisfies BackgroundCommand);
  } catch (e) {
    logger.debug("capture.toolbar.hide_failed", { tabId, sessionId }, e);
  }
}

export async function showToolbar(tabId: number, sessionId: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "RESTORE_CAPTURE",
      payload: { sessionId },
    } satisfies BackgroundCommand);
  } catch (e) {
    logger.debug("capture.toolbar.restore_failed", { tabId, sessionId }, e);
  }
}

/** Sanitized page-title basename — can never contain separators or reserved chars. */
export function titleSlug(tab: chrome.tabs.Tab): string {
  return sanitizeFilenamePart(tab.title ?? "");
}

export async function scrollTab(tabId: number, y: number, sessionId = ""): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_SCROLL",
      payload: { sessionId, scrollYCss: y },
    } satisfies BackgroundCommand);
  } catch {
    // Content script may be gone; nothing to restore.
  }
}

/** Number of capture attempts before giving up on a single viewport. */
const MAX_CAPTURE_ATTEMPTS = 3;

/**
 * Captures the visible tab with retries. Chrome rate-limits captureVisibleTab,
 * and a transient failure used to abort the whole capture. Retry with linear
 * backoff and validate the result is a real PNG data URL before accepting it.
 */
export async function captureSliceWithRetry(windowId: number): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt++) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/png")) return dataUrl;
    } catch (e) {
      logger.warn("capture.viewport_retry", { windowId, attempt, maxAttempts: MAX_CAPTURE_ATTEMPTS }, e);
    }
    if (attempt < MAX_CAPTURE_ATTEMPTS) await sleep(PAINT_SETTLE_MS * attempt);
  }
  throw new Error(`Capture failed after ${MAX_CAPTURE_ATTEMPTS} attempts — try again`);
}

/**
 * Shared slice-capture loop used by both full-page and element capture.
 * Scrolls the page to each planned Y position, captures the viewport, sends
 * the slice to the content script for stitching, and re-captures once if the
 * content script flags the slice as blank (mid-paint).
 */
export async function captureSliceLoop(
  tabId: number,
  sessionId: string,
  windowId: number,
  scrollYs: number[],
  scrollToY: (y: number) => Promise<number>,
  sendSlice: (dataUrl: string, scrollY: number) => Promise<boolean>,
  sendProgress: (current: number, total: number) => void,
): Promise<void> {
  pushProgress(tabId, sessionId, { current: 0, total: scrollYs.length, phase: "PREPARING" });
  for (const [index, y] of scrollYs.entries()) {
    const actualY = await scrollToY(y);
    await sleep(PAINT_SETTLE_MS);
    let dataUrl = await captureSliceWithRetry(windowId);
    const blank = await sendSlice(dataUrl, actualY);
    if (blank) {
      await sleep(PAINT_SETTLE_MS);
      dataUrl = await captureSliceWithRetry(windowId);
      await sendSlice(dataUrl, actualY);
    }
    sendProgress(index + 1, scrollYs.length);
  }
}
