import type { BackgroundCommand, MessageResponse } from "@shared/types";
import { timestampPart } from "@shared/utils/filename";
import { MAX_CANVAS_DIMENSION, exceedsCanvasLimit, planSlices } from "@content/capture/sliceMath";
import { finishCapture } from "../editorGateway";
import {
  captureSliceLoop,
  captureSliceWithRetry,
  hideToolbar,
  pushProgress,
  showToolbar,
  titleSlug,
  withCaptureCleanup,
  type CaptureCommand,
} from "../captureSupport";

interface ElementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ElementPrepData {
  success?: boolean;
  tooTall?: boolean;
  dpr?: number;
  rect?: ElementRect;
  elementDocTop?: number;
  elementHeightCss?: number;
  viewportHeightCss?: number;
  viewportWidthCss?: number;
  fullyVisible?: boolean;
  error?: { message?: string } | string;
}

/**
 * Captures a picked element without modifying the site's render tree.
 *
 * If every selected pixel is already visible, the worker takes exactly one
 * native-resolution viewport screenshot and crops the measured rectangle.
 * There is no zoom, page scroll, DOM isolation, style forcing, image-attribute
 * mutation, or responsive reflow on this path. Taller/offscreen elements keep
 * the native zoom and use viewport stitching as a constrained fallback.
 */
export async function captureElement(tabId: number | undefined, command: CaptureCommand): Promise<unknown> {
  if (tabId === undefined) throw new Error("No tab context for command");
  const { sessionId, elementId } = command.payload;
  if (!elementId) return { success: false, error: "No element selected for capture" };
  const tab = await chrome.tabs.get(tabId);
  const steps: string[] = [];

  await hideToolbar(tabId, sessionId);
  return withCaptureCleanup(async () => {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "PREPARE_ELEMENT_CAPTURE",
      payload: { sessionId, elementId },
    } satisfies BackgroundCommand)) as MessageResponse<ElementPrepData> | undefined;
    const prep = response?.data;
    if (!prep?.success || !prep.rect || !prep.elementHeightCss || prep.elementHeightCss <= 0) {
      const detail = typeof prep?.error === "string" ? prep.error : prep?.error?.message ?? "";
      throw new Error(`Could not prepare the element for capture${detail ? `: ${detail}` : ""}`);
    }

    const dpr = prep.dpr ?? 1;
    const rect = prep.rect;
    const elementDocTop = prep.elementDocTop ?? 0;
    const elementHeightCss = prep.elementHeightCss;
    const viewportHeightCss = prep.viewportHeightCss ?? 0;
    if (viewportHeightCss <= 0) throw new Error("Could not determine the viewport size");
    if (exceedsCanvasLimit(elementHeightCss, dpr)) {
      return { success: false, error: `Element is too tall for capture (max ${MAX_CANVAS_DIMENSION}px)` };
    }

    if (prep.fullyVisible) {
      // This is the fidelity-critical path: one frame, then a pure pixel crop.
      pushProgress(tabId, sessionId, { current: 0, total: 1, phase: "PREPARING" });
      const dataUrl = await captureSliceWithRetry(tab.windowId);
      const cropResult = (await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_ELEMENT_CROP",
        payload: { sessionId, dataUrl, dpr, rect },
      } satisfies BackgroundCommand)) as MessageResponse<{ success?: boolean; error?: string }> | undefined;
      if (!cropResult?.data?.success) {
        const detail = cropResult?.data?.error ?? cropResult?.error?.message ?? "";
        throw new Error(`Failed to crop the element image${detail ? `: ${detail}` : ""}`);
      }
      pushProgress(tabId, sessionId, { current: 1, total: 1, phase: "RENDERING" });
      steps.push("captured current pixels in one frame");
    } else {
      const scrollTo = async (y: number): Promise<number> => {
        const res = (await chrome.tabs.sendMessage(tabId, {
          type: "CAPTURE_ELEMENT_SCROLL",
          payload: { sessionId, scrollYCss: y },
        } satisfies BackgroundCommand)) as MessageResponse<{ success?: boolean; actualScrollY?: number }> | undefined;
        return typeof res?.data?.actualScrollY === "number" ? res.data.actualScrollY : y;
      };

      const relYs = planSlices(elementHeightCss, viewportHeightCss);
      await captureSliceLoop(
        tabId,
        sessionId,
        tab.windowId,
        relYs.map((rel) => elementDocTop + rel),
        scrollTo,
        async (dataUrl, scrollY) => {
          const res = (await chrome.tabs.sendMessage(tabId, {
            type: "CAPTURE_ELEMENT_SLICE",
            payload: { sessionId, dataUrl, scrollYCss: scrollY },
          } satisfies BackgroundCommand)) as MessageResponse<{ success?: boolean; blank?: boolean }> | undefined;
          return res?.data?.blank === true;
        },
        (current, total) => pushProgress(tabId, sessionId, { current, total, phase: "RENDERING" }),
      );

      const finalize = (await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_ELEMENT_FINALIZE",
        payload: { sessionId, dpr, rect },
      } satisfies BackgroundCommand)) as MessageResponse<{ success?: boolean; error?: string }> | undefined;
      if (!finalize?.data?.success) {
        const detail = finalize?.data?.error ?? finalize?.error?.message ?? "";
        throw new Error(`Failed to assemble the element image${detail ? `: ${detail}` : ""}`);
      }
      pushProgress(tabId, sessionId, { current: relYs.length, total: relYs.length, phase: "STITCHING" });
      steps.push(`captured ${relYs.length} native slice(s)`);
    }

    const key = `elementcapture:${sessionId}`;
    const stored = await chrome.storage.local.get(key);
    const image = stored?.[key];
    if (typeof image !== "string") throw new Error("Element image missing from storage");
    await chrome.storage.local.remove(key);

    const filename = `parotia-element-${titleSlug(tab)}-${timestampPart()}.png`;
    pushProgress(tabId, sessionId, { current: 1, total: 1, phase: "ENCODING" });
    const result = await finishCapture(tabId, sessionId, image, filename);
    if (!result.success) {
      return { ...result, steps };
    }
    steps.push("downloaded");
    return { ...result, success: true, filename, steps };
  }, async () => {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "CAPTURE_ELEMENT_RESTORE",
        payload: { sessionId },
      } satisfies BackgroundCommand);
    } catch {
      // Content script may be gone; toolbar restore remains best effort.
    }
    await showToolbar(tabId, sessionId);
  }).catch((error: unknown) => {
    throw new Error(
      `Element capture failed [${steps.join(" > ") || "start"}]: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
