import type { BackgroundCommand, MessageResponse } from "@shared/types";
import { sleep } from "@shared/utils/imageCodec";
import { timestampPart } from "@shared/utils/filename";
import { finishCapture } from "../editorGateway";
import {
  PAINT_SETTLE_MS, captureSliceWithRetry, hideToolbar, pushProgress, showToolbar, titleSlug,
  type CaptureCommand,
} from "../captureSupport";

/**
 * Captures a user-drawn region of the visible viewport. The content script
 * shows a free-selection overlay, the user draws a rectangle, the worker
 * captures the viewport, and the content script crops the result to the
 * selected area.
 */
export async function captureRegion(tabId: number | undefined, command: CaptureCommand): Promise<unknown> {
  if (tabId === undefined) throw new Error("No tab context for command");
  const { sessionId } = command.payload;
  const tab = await chrome.tabs.get(tabId);

  await hideToolbar(tabId, sessionId);
  try {
    pushProgress(tabId, sessionId, { current: 0, total: 1, phase: "PREPARING" });

    const selectRes = (await chrome.tabs.sendMessage(tabId, {
      type: "FREE_SELECT",
      payload: { sessionId },
    } satisfies BackgroundCommand)) as
      | MessageResponse<{ rect?: { x: number; y: number; width: number; height: number }; scrollY?: number; dpr?: number }>
      | undefined;

    const region = selectRes?.data;
    if (!region?.rect || region.rect.width <= 0 || region.rect.height <= 0) {
      return { success: false, error: "Selection cancelled" };
    }

    pushProgress(tabId, sessionId, { current: 0, total: 1, phase: "RENDERING" });
    // Force images (avatars, media) to load and render before capturing —
    // X/Twitter loads profile pictures in stages that race a simple sleep.
    await chrome.tabs.sendMessage(tabId, {
      type: "PREPARE_REGION_CAPTURE",
      payload: { sessionId },
    } satisfies BackgroundCommand);
    await sleep(PAINT_SETTLE_MS);
    const dataUrl = await captureSliceWithRetry(tab.windowId);
    pushProgress(tabId, sessionId, { current: 1, total: 1, phase: "ENCODING" });

    await chrome.tabs.sendMessage(tabId, {
      type: "CAPTURE_REGION_CROP",
      payload: { sessionId, dataUrl, rect: region.rect, dpr: region.dpr ?? 1 },
    } satisfies BackgroundCommand);

    const key = `regioncapture:${sessionId}`;
    const stored = await chrome.storage.local.get(key);
    const cropped = stored?.[key];
    if (typeof cropped !== "string") throw new Error("Region image missing from storage");
    await chrome.storage.local.remove(key);

    const filename = `parotia-region-${titleSlug(tab)}-${timestampPart()}.png`;
    pushProgress(tabId, sessionId, { current: 1, total: 1, phase: "ENCODING" });
    return finishCapture(tabId, sessionId, cropped, filename);
  } finally {
    // Restore page state after readiness work.
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "RESTORE_REGION_CAPTURE",
        payload: { sessionId },
      } satisfies BackgroundCommand);
    } catch {
      // Best effort — content script may be gone.
    }
    await showToolbar(tabId, sessionId);
  }
}
