import { createId } from "@shared/utils/id";
import { createLayerBase, type EditorGroupLayer, type EditorLayer, type EditorTransform } from "./EditorDocument";
import { estimateTextBox } from "./EditorTypography";

export type LayerAlignment = "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";
export type LayerDistribution = "horizontal" | "vertical";

export interface LayerBounds { left: number; top: number; right: number; bottom: number; width: number; height: number; centerX: number; centerY: number }
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function matrix(transform: EditorTransform): Matrix {
  const radians = transform.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [cosine * transform.scaleX, sine * transform.scaleX, -sine * transform.scaleY, cosine * transform.scaleY, transform.x, transform.y];
}

function multiply(parent: Matrix, child: Matrix): Matrix {
  return [
    parent[0] * child[0] + parent[2] * child[1],
    parent[1] * child[0] + parent[3] * child[1],
    parent[0] * child[2] + parent[2] * child[3],
    parent[1] * child[2] + parent[3] * child[3],
    parent[0] * child[4] + parent[2] * child[5] + parent[4],
    parent[1] * child[4] + parent[3] * child[5] + parent[5],
  ];
}

function point(value: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: value[0] * x + value[2] * y + value[4], y: value[1] * x + value[3] * y + value[5] };
}

function fromEdges(left: number, top: number, right: number, bottom: number): LayerBounds {
  return { left, top, right, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function localEdges(layer: Exclude<EditorLayer, EditorGroupLayer>): [number, number, number, number] {
  switch (layer.kind) {
    case "image": case "rectangle": case "callout": return [0, 0, layer.width, layer.height];
    case "text": {
      const box = estimateTextBox(layer);
      return [0, 0, box.width, box.height];
    }
    case "ellipse": return [-layer.radiusX, -layer.radiusY, layer.radiusX, layer.radiusY];
    case "line": case "arrow": {
      const xs = layer.points.filter((_, index) => index % 2 === 0);
      const ys = layer.points.filter((_, index) => index % 2 === 1);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
  }
}

function boundsWithParent(layer: EditorLayer, parent: Matrix): LayerBounds {
  const combined = multiply(parent, matrix(layer.transform));
  if (layer.kind === "group") {
    const bounds = layer.children.map((child) => boundsWithParent(child, combined));
    const left = Math.min(...bounds.map((entry) => entry.left));
    const top = Math.min(...bounds.map((entry) => entry.top));
    const right = Math.max(...bounds.map((entry) => entry.right));
    const bottom = Math.max(...bounds.map((entry) => entry.bottom));
    return fromEdges(left, top, right, bottom);
  }
  const [left, top, right, bottom] = localEdges(layer);
  const corners = [point(combined, left, top), point(combined, right, top), point(combined, right, bottom), point(combined, left, bottom)];
  return fromEdges(
    Math.min(...corners.map((entry) => entry.x)), Math.min(...corners.map((entry) => entry.y)),
    Math.max(...corners.map((entry) => entry.x)), Math.max(...corners.map((entry) => entry.y)),
  );
}

export function layerBounds(layer: EditorLayer): LayerBounds { return boundsWithParent(layer, IDENTITY); }

export function translateLayer(layer: EditorLayer, x: number, y: number): EditorLayer {
  return { ...layer, transform: { ...layer.transform, x: layer.transform.x + x, y: layer.transform.y + y } };
}

export function alignLayers(layers: EditorLayer[], alignment: LayerAlignment): EditorLayer[] {
  if (layers.length < 2) return layers;
  const entries = layers.map((layer) => ({ layer, bounds: layerBounds(layer) }));
  const target = alignment === "left" ? Math.min(...entries.map(({ bounds }) => bounds.left))
    : alignment === "right" ? Math.max(...entries.map(({ bounds }) => bounds.right))
      : alignment === "top" ? Math.min(...entries.map(({ bounds }) => bounds.top))
        : alignment === "bottom" ? Math.max(...entries.map(({ bounds }) => bounds.bottom))
          : alignment === "horizontal-center" ? entries.reduce((sum, { bounds }) => sum + bounds.centerX, 0) / entries.length
            : entries.reduce((sum, { bounds }) => sum + bounds.centerY, 0) / entries.length;
  return entries.map(({ layer, bounds }) => {
    const current = alignment === "left" ? bounds.left : alignment === "right" ? bounds.right
      : alignment === "top" ? bounds.top : alignment === "bottom" ? bounds.bottom
        : alignment === "horizontal-center" ? bounds.centerX : bounds.centerY;
    return alignment === "left" || alignment === "right" || alignment === "horizontal-center"
      ? translateLayer(layer, target - current, 0) : translateLayer(layer, 0, target - current);
  });
}

export function distributeLayers(layers: EditorLayer[], direction: LayerDistribution): EditorLayer[] {
  if (layers.length < 3) return layers;
  const entries = layers.map((layer) => ({ layer, bounds: layerBounds(layer) })).sort((a, b) => direction === "horizontal" ? a.bounds.centerX - b.bounds.centerX : a.bounds.centerY - b.bounds.centerY);
  const first = direction === "horizontal" ? entries[0]!.bounds.centerX : entries[0]!.bounds.centerY;
  const last = direction === "horizontal" ? entries.at(-1)!.bounds.centerX : entries.at(-1)!.bounds.centerY;
  const step = (last - first) / (entries.length - 1);
  const moved = new Map(entries.map((entry, index) => {
    const current = direction === "horizontal" ? entry.bounds.centerX : entry.bounds.centerY;
    const delta = first + step * index - current;
    return [entry.layer.id, direction === "horizontal" ? translateLayer(entry.layer, delta, 0) : translateLayer(entry.layer, 0, delta)] as const;
  }));
  return layers.map((layer) => moved.get(layer.id) ?? layer);
}

export function groupLayers(allLayers: EditorLayer[], selectedIds: string[]): { layers: EditorLayer[]; group: EditorGroupLayer } {
  const selected = new Set(selectedIds);
  const children = allLayers.filter((layer) => selected.has(layer.id)).map((layer, order) => ({ ...layer, order }));
  if (children.length < 2) throw new Error("Select at least two layers to create a group");
  if (children.some((layer) => layer.locked)) throw new Error("Unlock selected layers before grouping them");
  const insertionOrder = Math.max(...children.map((layer) => allLayers.findIndex((entry) => entry.id === layer.id)));
  const group: EditorGroupLayer = {
    ...createLayerBase("group", insertionOrder), kind: "group", name: `Group ${insertionOrder + 1}`, children,
  };
  const remaining = allLayers.filter((layer) => !selected.has(layer.id));
  remaining.splice(Math.min(insertionOrder - children.length + 1, remaining.length), 0, group);
  return { layers: remaining.map((layer, order) => ({ ...layer, order })), group };
}

function composeTransforms(parent: EditorTransform, child: EditorTransform): EditorTransform {
  const combined = multiply(matrix(parent), matrix(child));
  const scaleX = Math.hypot(combined[0], combined[1]);
  const determinant = combined[0] * combined[3] - combined[1] * combined[2];
  return {
    x: combined[4], y: combined[5], scaleX, scaleY: determinant / scaleX,
    rotation: Math.atan2(combined[1], combined[0]) * 180 / Math.PI,
  };
}

export function ungroupLayers(allLayers: EditorLayer[], selectedIds: string[]): { layers: EditorLayer[]; selection: string[] } {
  const selected = new Set(selectedIds);
  if (allLayers.some((layer) => selected.has(layer.id) && layer.kind === "group" && layer.locked)) throw new Error("Unlock selected groups before ungrouping them");
  const selection: string[] = [];
  const result: EditorLayer[] = [];
  for (const layer of allLayers) {
    if (layer.kind !== "group" || !selected.has(layer.id)) { result.push(layer); continue; }
    for (const child of layer.children) {
      const restored: EditorLayer = {
        ...child,
        visible: layer.visible && child.visible,
        locked: layer.locked || child.locked,
        opacity: layer.opacity * child.opacity,
        transform: composeTransforms(layer.transform, child.transform),
      };
      result.push(restored);
      selection.push(restored.id);
    }
  }
  return { layers: result.map((layer, order) => ({ ...layer, order })), selection };
}

export function cloneLayers(layers: EditorLayer[], offset = 16): EditorLayer[] {
  const clone = (layer: EditorLayer, topLevel: boolean): EditorLayer => {
    const copy = {
      ...layer,
      id: createId("editor-layer"),
      name: `${layer.name} copy`,
      transform: { ...layer.transform, x: layer.transform.x + (topLevel ? offset : 0), y: layer.transform.y + (topLevel ? offset : 0) },
    } as EditorLayer;
    return copy.kind === "group" ? { ...copy, children: copy.children.map((child) => clone(child, false)) } : copy;
  };
  return layers.map((layer, order) => ({ ...clone(layer, true), order }));
}
