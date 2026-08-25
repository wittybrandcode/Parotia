import type { EditorLayer } from "./EditorDocument";
import { layerBounds, translateLayer, type LayerBounds } from "./EditorLayerOperations";

export interface SnapCanvas { width: number; height: number }
export interface SnapGuide { axis: "vertical" | "horizontal"; position: number; source: "canvas" | "layer" }
export interface SnapResult { deltaX: number; deltaY: number; guides: SnapGuide[] }

interface Target { value: number; source: SnapGuide["source"] }

function combinedBounds(layers: EditorLayer[]): LayerBounds | null {
  if (!layers.length) return null;
  const bounds = layers.map(layerBounds);
  const left = Math.min(...bounds.map((entry) => entry.left));
  const top = Math.min(...bounds.map((entry) => entry.top));
  const right = Math.max(...bounds.map((entry) => entry.right));
  const bottom = Math.max(...bounds.map((entry) => entry.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function nearestAdjustment(anchors: number[], targets: Target[], threshold: number): { adjustment: number; target: Target } | null {
  let best: { adjustment: number; target: Target } | null = null;
  for (const anchor of anchors) {
    for (const target of targets) {
      const adjustment = target.value - anchor;
      if (Math.abs(adjustment) <= threshold && (!best || Math.abs(adjustment) < Math.abs(best.adjustment))) best = { adjustment, target };
    }
  }
  return best;
}

export function snapLayerSelection(
  movingLayers: EditorLayer[], stationaryLayers: EditorLayer[], canvas: SnapCanvas,
  rawDeltaX: number, rawDeltaY: number, threshold: number,
): SnapResult {
  const movedBounds = combinedBounds(movingLayers.map((layer) => translateLayer(layer, rawDeltaX, rawDeltaY)));
  if (!movedBounds || !Number.isFinite(threshold) || threshold <= 0) return { deltaX: rawDeltaX, deltaY: rawDeltaY, guides: [] };

  const xTargets: Target[] = [{ value: 0, source: "canvas" }, { value: canvas.width / 2, source: "canvas" }, { value: canvas.width, source: "canvas" }];
  const yTargets: Target[] = [{ value: 0, source: "canvas" }, { value: canvas.height / 2, source: "canvas" }, { value: canvas.height, source: "canvas" }];
  for (const layer of stationaryLayers) {
    const bounds = layerBounds(layer);
    xTargets.push({ value: bounds.left, source: "layer" }, { value: bounds.centerX, source: "layer" }, { value: bounds.right, source: "layer" });
    yTargets.push({ value: bounds.top, source: "layer" }, { value: bounds.centerY, source: "layer" }, { value: bounds.bottom, source: "layer" });
  }

  const horizontal = nearestAdjustment([movedBounds.left, movedBounds.centerX, movedBounds.right], xTargets, threshold);
  const vertical = nearestAdjustment([movedBounds.top, movedBounds.centerY, movedBounds.bottom], yTargets, threshold);
  return {
    deltaX: rawDeltaX + (horizontal?.adjustment ?? 0),
    deltaY: rawDeltaY + (vertical?.adjustment ?? 0),
    guides: [
      ...(horizontal ? [{ axis: "vertical", position: horizontal.target.value, source: horizontal.target.source } as const] : []),
      ...(vertical ? [{ axis: "horizontal", position: vertical.target.value, source: vertical.target.source } as const] : []),
    ],
  };
}
