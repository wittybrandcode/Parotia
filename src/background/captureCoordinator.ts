import type { BackgroundCommand } from "@shared/types";
import { captureVisibleArea } from "./captureModes/visibleCapture";
import { captureFullPage } from "./captureModes/fullPageCapture";
import { captureElement } from "./captureModes/elementCapture";
import { captureRegion } from "./captureModes/regionCapture";

const activeCaptureTabs = new Set<number>();

export async function captureByMode(
  tabId: number,
  capture: Extract<BackgroundCommand, { type: "CAPTURE" }>,
): Promise<unknown> {
  if (activeCaptureTabs.has(tabId)) throw new Error("A capture is already running in this tab");
  activeCaptureTabs.add(tabId);
  try {
    if (capture.payload.mode === "FULL_PAGE") return await captureFullPage(tabId, capture);
    if (capture.payload.mode === "ELEMENT") return await captureElement(tabId, capture);
    if (capture.payload.mode === "REGION") return await captureRegion(tabId, capture);
    return await captureVisibleArea(tabId, capture);
  } finally {
    activeCaptureTabs.delete(tabId);
  }
}

export function clearCaptureForTab(tabId: number): void {
  activeCaptureTabs.delete(tabId);
}
