import type { BackgroundCommand, MessageResponse } from "@shared/types";
import { sleep } from "@shared/utils/imageCodec";
import { timestampPart } from "@shared/utils/filename";
import { MAX_CANVAS_DIMENSION, exceedsCanvasLimit, planSlices } from "@content/capture/sliceMath";
import { finishCapture } from "../editorGateway";
import {
  PAINT_SETTLE_MS, captureSliceLoop, hideToolbar, pushProgress, scrollTab, showToolbar, titleSlug,
  type CaptureCommand,
} from "../captureSupport";

/**
 * Captures the whole page from top to bottom: the content script measures the
 * page and reports the real scroll position after each jump; the worker
 * captures each viewport and the content script stitches the slices together.
 */
export async function captureFullPage(tabId: number | undefined, command: CaptureCommand): Promise<unknown> {
  if (tabId === undefined) throw new Error("No tab context for command");
  const { sessionId } = command.payload;
  const tab = await chrome.tabs.get(tabId);
  let originalScrollY = 0;
  let zoomChangedForLimit = false;
  let originalZoom = 1;
  try {
    const zoomValue = await chrome.tabs.getZoom(tabId);
    if (typeof zoomValue === "number" && Number.isFinite(zoomValue)) originalZoom = zoomValue;
  } catch {
    // Zoom API unavailable — treat as 100%.
  }
  const steps: string[] = [];

  await hideToolbar(tabId, sessionId);
  try {
    const sendStart = async (): Promise<
      MessageResponse<{
        success?: boolean;
        metrics?: {
          pageHeightCss: number;
          viewportHeightCss: number;
          dpr: number;
          scrollY: number;
          fixedHeaders?: number;
        };
      }>
    > => {
      return (await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_STITCH_START",
        payload: { sessionId },
      } satisfies BackgroundCommand)) as MessageResponse<{
        success?: boolean;
        metrics?: {
          pageHeightCss: number;
          viewportHeightCss: number;
          dpr: number;
          scrollY: number;
          fixedHeaders?: number;
        };
      }>;
    };

    const startRes = await sendStart();
    const startData = startRes?.data;
    let metrics = startData?.metrics;
    if (!startData?.success || !metrics || metrics.pageHeightCss <= 0) {
      const detail =
        (startRes?.error?.message ?? "") ||
        (startData && typeof startData === "object" && "error" in startData
          ? String((startData as { error?: { message?: string } }).error?.message ?? "")
          : "");
      const raw = startRes === undefined ? " (no response from content script)" : "";
      throw new Error(`Could not measure the page${detail ? `: ${detail}` : ""}${raw}`);
    }
    steps.push(`measured ${Math.round(metrics.pageHeightCss)}px`);
    if (metrics.fixedHeaders) steps.push(`${metrics.fixedHeaders} fixed header(s)`);
    originalScrollY = metrics.scrollY;

    // Canvas bitmaps are capped at MAX_CANVAS_DIMENSION per edge. If the page at
    // the native resolution exceeds that, zoom the tab out so the effective
    // device-pixel ratio shrinks (like element capture zooms IN for quality,
    // this zooms OUT for coverage). Re-measure and capture at the lower DPR.
    if (exceedsCanvasLimit(metrics.pageHeightCss, metrics.dpr)) {
      const targetZoom = Math.max(
        0.25,
        (originalZoom * MAX_CANVAS_DIMENSION) / (metrics.pageHeightCss * metrics.dpr),
      );
      if (Math.abs(targetZoom - originalZoom) > 0.05) {
        try {
          await chrome.tabs.setZoom(tabId, targetZoom);
          await sleep(PAINT_SETTLE_MS);
          zoomChangedForLimit = true;
          steps.push(`zoomed out to ${targetZoom.toFixed(2)}x`);
          const retry = await sendStart();
          if (retry?.data?.success && retry.data.metrics && retry.data.metrics.pageHeightCss > 0) {
            metrics = retry.data.metrics;
            originalScrollY = metrics.scrollY;
            steps.push(`re-measured ${Math.round(metrics.pageHeightCss)}px @ dpr ${metrics.dpr.toFixed(2)}`);
          }
        } catch {
          // Zoom unavailable — fall through and report the limit below.
        }
      }
    }

    if (!metrics || exceedsCanvasLimit(metrics.pageHeightCss, metrics.dpr)) {
      return {
        success: false,
        error:
          `Page is too tall for a single full-page capture (max ${MAX_CANVAS_DIMENSION}px). ` +
          `Use Free-Select to capture a section, or capture at a lower zoom.`,
      };
    }

    const maxScroll = Math.max(0, metrics.pageHeightCss - metrics.viewportHeightCss);
    const scrollYs = planSlices(metrics.pageHeightCss, metrics.viewportHeightCss);

    const scrollTo = async (y: number): Promise<number> => {
      const res = (await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_SCROLL",
        payload: { sessionId, scrollYCss: y },
      } satisfies BackgroundCommand)) as
        | MessageResponse<{ success?: boolean; actualScrollY?: number }>
        | undefined;
      return typeof res?.data?.actualScrollY === "number" ? res.data.actualScrollY : y;
    };

    await captureSliceLoop(
      tabId, sessionId, tab.windowId,
      scrollYs.map((y) => Math.min(y, maxScroll)),
      scrollTo,
      async (dataUrl, scrollY) => {
        const res = (await chrome.tabs.sendMessage(tabId, {
          type: "CAPTURE_SLICE",
          payload: { sessionId, dataUrl, scrollYCss: scrollY },
        } satisfies BackgroundCommand)) as
          | MessageResponse<{ success?: boolean; blank?: boolean }>
          | undefined;
        return res?.data?.blank === true;
      },
      (current, total) => pushProgress(tabId, sessionId, { current, total, phase: "RENDERING" }),
    );
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
    pushProgress(tabId, sessionId, { current: scrollYs.length, total: scrollYs.length, phase: "STITCHING" });

    const key = `capture:${sessionId}`;
    const stored = await chrome.storage.local.get(key);
    const dataUrl = stored?.[key];
    if (typeof dataUrl !== "string") {
      throw new Error("Full-page image missing from storage");
    }
    await chrome.storage.local.remove(key);

    const filename = `parotia-fullpage-${titleSlug(tab)}-${timestampPart()}.png`;
    pushProgress(tabId, sessionId, { current: scrollYs.length, total: scrollYs.length, phase: "ENCODING" });
    const result2 = await finishCapture(tabId, sessionId, dataUrl, filename);
    if (typeof result2 === "object" && result2 !== null && "success" in result2 && !(result2 as { success: boolean }).success) {
      return { ...result2, steps };
    }
    steps.push("downloaded");
    return { success: true, filename, ...(typeof result2 === "object" && result2 !== null ? result2 : {}), steps };
  } catch (error) {
    throw new Error(`Capture failed [${steps.join(" > ") || "start"}]: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await scrollTab(tabId, originalScrollY, sessionId);
    if (zoomChangedForLimit) {
      try {
        await chrome.tabs.setZoom(tabId, originalZoom);
      } catch {
        // Ignore — the tab zoom is best-effort to restore.
      }
    }
    await showToolbar(tabId, sessionId);
  }
}
