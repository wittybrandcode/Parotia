import { sleep } from "@shared/utils/imageCodec";
import { timestampPart } from "@shared/utils/filename";
import { finishCapture } from "../editorGateway";
import {
  PAINT_SETTLE_MS, captureSliceWithRetry, hideToolbar, pushProgress, showToolbar, titleSlug,
  type CaptureCommand,
} from "../captureSupport";

/** Captures the currently visible viewport and downloads it as a PNG. */
export async function captureVisibleArea(tabId: number | undefined, command: CaptureCommand): Promise<unknown> {
  if (tabId === undefined) throw new Error("No tab context for command");
  const { sessionId } = command.payload;
  const tab = await chrome.tabs.get(tabId);

  await hideToolbar(tabId, sessionId);
  try {
    pushProgress(tabId, sessionId, { current: 0, total: 1, phase: "PREPARING" });
    await sleep(PAINT_SETTLE_MS);
    const dataUrl = await captureSliceWithRetry(tab.windowId);
    pushProgress(tabId, sessionId, { current: 1, total: 1, phase: "RENDERING" });
    const filename = `parotia-${titleSlug(tab)}-${timestampPart()}.png`;
    pushProgress(tabId, sessionId, { current: 1, total: 1, phase: "ENCODING" });
    return finishCapture(tabId, sessionId, dataUrl, filename);
  } finally {
    await showToolbar(tabId, sessionId);
  }
}
