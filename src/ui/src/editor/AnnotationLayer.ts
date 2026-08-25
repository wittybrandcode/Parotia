/**
 * Editable Konva annotation layer. The stage owns the visible image and the
 * annotations; CanvasEngine only receives a rendered snapshot when an image
 * transform is explicitly committed.
 */
import Konva from "konva";
import { createLayerBase, type EditorLayer } from "./EditorDocument";

export type AnnotateTool = "freehand" | "line" | "rect" | "ellipse" | "arrow" | "text" | "callout";
export type AnnotationMode = "idle" | "draw" | "select";

export interface AnnotationOptions {
  color: string;
  strokeWidth: number;
  fontSize: number;
}

export interface AnnotationLayer {
  readonly width: number;
  readonly height: number;
  init(container: HTMLDivElement, width: number, height: number, backgroundImage: HTMLImageElement): void;
  setMode(mode: AnnotationMode): void;
  setTool(tool: AnnotateTool): void;
  setOptions(opts: Partial<AnnotationOptions>): void;
  loadLayers(layers: EditorLayer[]): Promise<void>;
  replaceLayers(layers: EditorLayer[]): Promise<void>;
  selectLayer(layerId: string | null): void;
  selectLayers(layerIds: string[]): void;
  setCommitListener(listener: ((layer: EditorLayer) => void) | null): void;
  setSelectionListener(listener: ((layerIds: string[]) => void) | null): void;
  setTransformListener(listener: ((before: EditorLayer[], after: EditorLayer[]) => void) | null): void;
  renderTo(canvas: HTMLCanvasElement): void;
  destroy(): void;
}

const DEFAULT_OPTIONS: AnnotationOptions = { color: "#c1e899", strokeWidth: 3, fontSize: 24 };

export function createAnnotationLayer(): AnnotationLayer {
  let stage: Konva.Stage | null = null;
  let annotationLayer: Konva.Layer | null = null;
  let uiLayer: Konva.Layer | null = null;
  let transformer: Konva.Transformer | null = null;
  let cursorCircle: Konva.Circle | null = null;
  let activeShape: Konva.Shape | null = null;
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentTool: AnnotateTool = "freehand";
  let currentMode: AnnotationMode = "idle";
  let selectedLayerIds: string[] = [];
  let pendingInput: HTMLInputElement | null = null;
  let stageWidth = 0;
  let stageHeight = 0;
  let layerCount = 0;
  const options = { ...DEFAULT_OPTIONS };
  const layerModels = new Map<string, EditorLayer>();

  let onCommit: ((layer: EditorLayer) => void) | null = null;
  let onSelection: ((layerIds: string[]) => void) | null = null;
  let onTransform: ((before: EditorLayer[], after: EditorLayer[]) => void) | null = null;
  let gestureBefore: Map<string, EditorLayer> | null = null;
  let activeDragId: string | null = null;

  function pointer(): { x: number; y: number } {
    return stage?.getPointerPosition() ?? { x: 0, y: 0 };
  }

  function updateCursor(): void {
    if (!cursorCircle) return;
    cursorCircle.radius(Math.max(options.strokeWidth / 2, 2));
    cursorCircle.stroke(options.color);
    cursorCircle.strokeWidth(1);
  }

  function addShape(shape: Konva.Shape | Konva.Group, layer: EditorLayer): void {
    shape.id(layer.id);
    shape.name(`editor-layer ${layer.kind}`);
    layerModels.set(layer.id, layer);
    annotationLayer?.add(shape);
    annotationLayer?.batchDraw();
    layerCount += 1;
    onCommit?.(layer);
  }

  function committedLayer(shape: Konva.Shape, tool: Exclude<AnnotateTool, "text" | "callout">): EditorLayer {
    if (tool === "freehand" || tool === "line") {
      const line = shape as Konva.Line;
      return { ...createLayerBase("line", layerCount), kind: "line", points: [...line.points()], stroke: options.color, strokeWidth: options.strokeWidth, tension: tool === "freehand" ? 0.5 : 0 };
    }
    if (tool === "arrow") {
      const arrow = shape as Konva.Arrow;
      return {
        ...createLayerBase("arrow", layerCount), kind: "arrow", points: [...arrow.points()], stroke: options.color,
        strokeWidth: options.strokeWidth, pointerLength: Math.max(options.strokeWidth * 3, 10), pointerWidth: Math.max(options.strokeWidth * 2, 8),
      };
    }
    if (tool === "rect") {
      const rect = shape as Konva.Rect;
      const position = rect.position();
      return {
        ...createLayerBase("rectangle", layerCount, position.x, position.y), kind: "rectangle", width: rect.width(), height: rect.height(),
        cornerRadius: 0, fill: null, stroke: options.color, strokeWidth: options.strokeWidth,
      };
    }
    const ellipse = shape as Konva.Ellipse;
    const position = ellipse.position();
    return {
      ...createLayerBase("ellipse", layerCount, position.x, position.y), kind: "ellipse", radiusX: ellipse.radiusX(), radiusY: ellipse.radiusY(),
      fill: null, stroke: options.color, strokeWidth: options.strokeWidth,
    };
  }

  function makeShape(pos: { x: number; y: number }): Konva.Shape | null {
    const base = { stroke: options.color, strokeWidth: options.strokeWidth, draggable: false };
    switch (currentTool) {
      case "freehand":
        return new Konva.Line({ ...base, points: [pos.x, pos.y], lineCap: "round", lineJoin: "round", tension: 0.5 });
      case "line":
        return new Konva.Line({ ...base, points: [pos.x, pos.y, pos.x, pos.y], lineCap: "round" });
      case "rect":
        return new Konva.Rect({ ...base, x: pos.x, y: pos.y, width: 0, height: 0 });
      case "ellipse":
        return new Konva.Ellipse({ ...base, x: pos.x, y: pos.y, radiusX: 0, radiusY: 0 });
      case "arrow":
        return new Konva.Arrow({ ...base, points: [pos.x, pos.y, pos.x, pos.y], fill: options.color, pointerLength: Math.max(options.strokeWidth * 3, 10), pointerWidth: Math.max(options.strokeWidth * 2, 8) });
      case "text":
      case "callout":
        return null;
    }
  }

  function layerNode(layerId: string): Konva.Node | null {
    return annotationLayer?.findOne((node: Konva.Node) => node.id() === layerId) ?? null;
  }

  function nodeLayerId(target: Konva.Node): string | null {
    let node: Konva.Node | null = target;
    while (node && node !== stage) {
      if (layerModels.has(node.id())) return node.id();
      node = node.getParent();
    }
    return null;
  }

  function updateSelectionPresentation(): void {
    const selected = new Set(selectedLayerIds);
    for (const [id, model] of layerModels) {
      const node = layerNode(id);
      node?.draggable(currentMode === "select" && selected.has(id) && !model.locked && model.visible);
    }
    const nodes = currentMode === "select" ? selectedLayerIds.flatMap((id) => {
      const model = layerModels.get(id);
      const node = layerNode(id);
      return node && model?.visible && !model.locked ? [node] : [];
    }) : [];
    transformer?.nodes(nodes);
    if (transformer && typeof transformer.keepRatio === "function") transformer.keepRatio(nodes.some((node) => layerModels.get(node.id())?.kind === "group"));
    transformer?.getLayer()?.batchDraw();
  }

  function selectLayer(layerId: string | null): void {
    selectLayers(layerId ? [layerId] : []);
  }

  function selectLayers(layerIds: string[]): void {
    selectedLayerIds = [...new Set(layerIds)].filter((id) => layerModels.has(id));
    updateSelectionPresentation();
    onSelection?.([...selectedLayerIds]);
  }

  function onGestureStart(event: Konva.KonvaEventObject<Event>): void {
    const id = nodeLayerId(event.target);
    if (!id || !selectedLayerIds.includes(id)) return;
    gestureBefore = new Map(selectedLayerIds.flatMap((selectedId) => {
      const model = layerModels.get(selectedId);
      return model && !model.locked && model.visible && layerNode(selectedId) ? [[selectedId, model] as const] : [];
    }));
    activeDragId = event.type === "dragstart" ? id : null;
  }

  function onDragMove(event: Konva.KonvaEventObject<Event>): void {
    const id = activeDragId && nodeLayerId(event.target);
    const origin = id ? gestureBefore?.get(id) : null;
    const node = id ? layerNode(id) : null;
    if (!id || !origin || !node) return;
    const deltaX = node.x() - origin.transform.x;
    const deltaY = node.y() - origin.transform.y;
    for (const [otherId, before] of gestureBefore ?? []) {
      if (otherId === id) continue;
      layerNode(otherId)?.position({ x: before.transform.x + deltaX, y: before.transform.y + deltaY });
    }
    annotationLayer?.batchDraw();
  }

  function onGestureEnd(): void {
    if (!gestureBefore) return;
    const before = [...gestureBefore.values()];
    gestureBefore = null;
    activeDragId = null;
    const after = before.map((model) => {
      const node = layerNode(model.id);
      if (!node) return model;
      const transformed: EditorLayer = { ...model, transform: { x: node.x(), y: node.y(), scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation() } };
      layerModels.set(model.id, transformed);
      return transformed;
    });
    if (before.some((entry, index) => JSON.stringify(entry.transform) !== JSON.stringify(after[index]?.transform))) onTransform?.(before, after);
  }

  function onPointerDown(event: Konva.KonvaEventObject<PointerEvent>): void {
    if (!stage || !annotationLayer || pendingInput) return;
    if (currentMode === "idle") return;
    if (currentMode === "select") {
      const parent = event.target.getParent();
      if (parent === transformer || parent?.getParent?.() === transformer) return;
      const id = event.target === stage ? null : nodeLayerId(event.target);
      const sourceEvent = event.evt as PointerEvent | undefined;
      const modifier = Boolean(sourceEvent?.shiftKey || sourceEvent?.ctrlKey || sourceEvent?.metaKey);
      if (!id) { if (!modifier) selectLayers([]); }
      else if (modifier) selectLayers(selectedLayerIds.includes(id) ? selectedLayerIds.filter((entry) => entry !== id) : [...selectedLayerIds, id]);
      else selectLayers([id]);
      return;
    }
    // Draw mode is explicit: a new layer may be placed over an existing one.
    // Requiring an empty Stage hit made text and overlapping annotations fail
    // whenever Konva resolved the pointer to another visible layer.
    const pos = pointer();
    // Text editors are opened from the completed click/tap event. Creating and
    // focusing an input during pointerdown lets the remainder of that same
    // click blur and remove it before the user can type.
    if (currentTool === "text" || currentTool === "callout") return;
    startX = pos.x;
    startY = pos.y;
    activeShape = makeShape(pos);
    if (!activeShape) return;
    annotationLayer.add(activeShape);
    isDrawing = true;
    annotationLayer.batchDraw();
  }

  function onTextActivate(): void {
    if (currentMode !== "draw" || pendingInput || (currentTool !== "text" && currentTool !== "callout")) return;
    const pos = pointer();
    placeText(pos.x, pos.y, currentTool);
  }

  function onPointerMove(): void {
    const pos = pointer();
    if (cursorCircle) {
      cursorCircle.position(pos);
      cursorCircle.getLayer()?.batchDraw();
    }
    if (!isDrawing || !activeShape || !annotationLayer) return;
    if (currentTool === "freehand") {
      const line = activeShape as Konva.Line;
      line.points([...line.points(), pos.x, pos.y]);
    } else if (currentTool === "line" || currentTool === "arrow") {
      (activeShape as Konva.Line).points([startX, startY, pos.x, pos.y]);
    } else if (currentTool === "rect") {
      const rect = activeShape as Konva.Rect;
      rect.position({ x: Math.min(startX, pos.x), y: Math.min(startY, pos.y) });
      rect.size({ width: Math.abs(pos.x - startX), height: Math.abs(pos.y - startY) });
    } else if (currentTool === "ellipse") {
      const ellipse = activeShape as Konva.Ellipse;
      ellipse.position({ x: (startX + pos.x) / 2, y: (startY + pos.y) / 2 });
      ellipse.radiusX(Math.abs(pos.x - startX) / 2);
      ellipse.radiusY(Math.abs(pos.y - startY) / 2);
    }
    annotationLayer.batchDraw();
  }

  function shouldDiscard(shape: Konva.Shape): boolean {
    if (currentTool === "freehand") return (shape as Konva.Line).points().length < 4;
    if (currentTool === "line" || currentTool === "arrow") {
      const points = (shape as Konva.Line).points();
      return Math.hypot((points[2] ?? 0) - (points[0] ?? 0), (points[3] ?? 0) - (points[1] ?? 0)) < 2;
    }
    if (currentTool === "rect") return (shape as Konva.Rect).width() < 2 || (shape as Konva.Rect).height() < 2;
    if (currentTool === "ellipse") return (shape as Konva.Ellipse).radiusX() < 2 || (shape as Konva.Ellipse).radiusY() < 2;
    return false;
  }

  function onPointerUp(): void {
    if (!isDrawing || !activeShape || !annotationLayer) return;
    const shape = activeShape;
    activeShape = null;
    isDrawing = false;
    if (shouldDiscard(shape)) shape.destroy();
    else {
      const layer = committedLayer(shape, currentTool as Exclude<AnnotateTool, "text" | "callout">);
      shape.id(layer.id);
      shape.name(`editor-layer ${layer.kind}`);
      layerModels.set(layer.id, layer);
      onCommit?.(layer);
      layerCount += 1;
    }
    annotationLayer.batchDraw();
  }

  function placeText(x: number, y: number, kind: "text" | "callout"): void {
    if (!stage || !annotationLayer || pendingInput) return;
    const rect = stage.container().getBoundingClientRect();
    const scale = rect.width / stage.width();
    const input = document.createElement("input");
    let finished = false;
    pendingInput = input;
    input.className = "nc-editor-inline-text-input";
    input.setAttribute("aria-label", kind === "text" ? "Enter text" : "Enter callout text");
    input.setAttribute("dir", "auto");
    input.placeholder = kind === "text" ? "Type text…" : "Type callout…";
    Object.assign(input.style, {
      position: "fixed", left: `${rect.left + x * scale}px`, top: `${rect.top + (y - options.fontSize / 2) * scale}px`,
      fontSize: `${options.fontSize * scale}px`, color: options.color, background: "rgba(0,0,0,0.75)",
      border: `1px solid ${options.color}`, borderRadius: "4px", padding: "2px 6px", outline: "none", minWidth: "80px", zIndex: "2147483647",
    });
    const finish = (save: boolean): void => {
      if (finished) return;
      finished = true;
      const text = input.value.trim();
      if (save && text && kind === "text") {
        const textY = y - options.fontSize / 2;
        const layer: EditorLayer = {
          ...createLayerBase("text", layerCount, x, textY), kind: "text", text, fontSize: options.fontSize,
          fontFamily: "sans-serif", fontWeight: 400, fontStyle: "normal", align: "left", fill: options.color,
        };
        addShape(new Konva.Text({ x, y: textY, text, fontSize: options.fontSize, fontFamily: "sans-serif", fill: options.color, draggable: false }), layer);
      } else if (save && text) {
        const width = 240;
        const height = 96;
        const layer: EditorLayer = {
          ...createLayerBase("callout", layerCount, x, y), kind: "callout", text, width, height,
          fontFamily: "sans-serif", fontSize: options.fontSize, textColor: "#111111", fill: options.color,
          stroke: options.color, strokeWidth: Math.max(1, options.strokeWidth),
        };
        const group = new Konva.Group({ x, y, draggable: false });
        group.add(
          new Konva.Rect({ width, height, fill: options.color, stroke: options.color, strokeWidth: options.strokeWidth, cornerRadius: 6 }),
          new Konva.Text({ text, width, height, padding: 8, fontFamily: "sans-serif", fontSize: options.fontSize, fill: "#111111", verticalAlign: "middle", align: "center" }),
        );
        addShape(group, layer);
      }
      input.remove();
      pendingInput = null;
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); finish(true); }
      if (event.key === "Escape") { event.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    document.body.appendChild(input);
    input.focus();
  }

  function init(container: HTMLDivElement, width: number, height: number, backgroundImage: HTMLImageElement): void {
    destroy();
    stageWidth = width;
    stageHeight = height;
    layerCount = 0;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    stage = new Konva.Stage({ container, width, height });
    const backgroundLayer = new Konva.Layer({ listening: false });
    annotationLayer = new Konva.Layer();
    uiLayer = new Konva.Layer();
    stage.add(backgroundLayer, annotationLayer, uiLayer);
    backgroundLayer.add(new Konva.Image({ image: backgroundImage, width, height, listening: false }));
    cursorCircle = new Konva.Circle({ x: -100, y: -100, visible: false, listening: false });
    uiLayer.add(cursorCircle);
    transformer = new Konva.Transformer({
      name: "editor-transformer-anchor", rotateEnabled: true, keepRatio: false, flipEnabled: false, ignoreStroke: true,
      borderStroke: "#c1e899", borderStrokeWidth: 1, anchorFill: "#c1e899", anchorStroke: "#111111", anchorSize: 9,
      boundBoxFunc: (oldBox, newBox) => Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox,
    });
    uiLayer.add(transformer);
    stage.on("pointerdown", onPointerDown);
    stage.on("pointermove", onPointerMove);
    stage.on("pointerup pointercancel", onPointerUp);
    stage.on("click tap", onTextActivate);
    stage.on("dragstart transformstart", onGestureStart);
    stage.on("dragmove", onDragMove);
    stage.on("dragend transformend", onGestureEnd);
    setTool("freehand");
    setMode("idle");
    updateCursor();
    stage.draw();
  }

  function nodeOptions(layer: EditorLayer): Record<string, unknown> {
    return {
      id: layer.id, name: `editor-layer ${layer.kind}`,
      x: layer.transform.x, y: layer.transform.y, scaleX: layer.transform.scaleX, scaleY: layer.transform.scaleY,
      rotation: layer.transform.rotation, opacity: layer.opacity, visible: layer.visible, draggable: false, listening: !layer.locked,
    };
  }

  async function loadImage(source: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load an editor image layer"));
      image.src = source;
    });
    return image;
  }

  async function nodeFromLayer(layer: EditorLayer): Promise<Konva.Shape | Konva.Group> {
    const common = nodeOptions(layer);
    switch (layer.kind) {
      case "image":
        return new Konva.Image({ ...common, image: await loadImage(layer.source), width: layer.width, height: layer.height });
      case "text":
        {
          const fontStyle = `${layer.fontWeight >= 600 ? "bold " : ""}${layer.fontStyle === "italic" ? "italic" : ""}`.trim() || "normal";
        return new Konva.Text({
          ...common, text: layer.text, fontFamily: layer.fontFamily, fontSize: layer.fontSize, fontStyle,
          align: layer.align, fill: layer.fill, ...(layer.width === undefined ? {} : { width: layer.width }),
        });
        }
      case "rectangle":
        return new Konva.Rect({ ...common, width: layer.width, height: layer.height, cornerRadius: layer.cornerRadius, ...(layer.fill === null ? {} : { fill: layer.fill }), stroke: layer.stroke, strokeWidth: layer.strokeWidth });
      case "ellipse":
        return new Konva.Ellipse({ ...common, radiusX: layer.radiusX, radiusY: layer.radiusY, ...(layer.fill === null ? {} : { fill: layer.fill }), stroke: layer.stroke, strokeWidth: layer.strokeWidth });
      case "line":
        return new Konva.Line({ ...common, points: layer.points, stroke: layer.stroke, strokeWidth: layer.strokeWidth, tension: layer.tension, lineCap: "round", lineJoin: "round" });
      case "arrow":
        return new Konva.Arrow({ ...common, points: layer.points, stroke: layer.stroke, fill: layer.stroke, strokeWidth: layer.strokeWidth, pointerLength: layer.pointerLength, pointerWidth: layer.pointerWidth });
      case "callout": {
        const group = new Konva.Group(common);
        group.add(
          new Konva.Rect({ width: layer.width, height: layer.height, ...(layer.fill === null ? {} : { fill: layer.fill }), stroke: layer.stroke, strokeWidth: layer.strokeWidth, cornerRadius: 6 }),
          new Konva.Text({ text: layer.text, width: layer.width, height: layer.height, padding: 8, fontFamily: layer.fontFamily, fontSize: layer.fontSize, fill: layer.textColor, verticalAlign: "middle", align: "center" }),
        );
        return group;
      }
      case "group": {
        const group = new Konva.Group(common);
        for (const child of [...layer.children].sort((a, b) => a.order - b.order)) group.add(await nodeFromLayer(child));
        return group;
      }
    }
  }

  async function loadLayers(layers: EditorLayer[]): Promise<void> {
    if (!annotationLayer) throw new Error("Annotation layer is not initialized");
    for (const layer of [...layers].sort((a, b) => a.order - b.order)) {
      layerModels.set(layer.id, layer);
      annotationLayer.add(await nodeFromLayer(layer));
    }
    layerCount = layers.length;
    updateSelectionPresentation();
    annotationLayer.batchDraw();
  }

  async function replaceLayers(layers: EditorLayer[]): Promise<void> {
    if (!annotationLayer) throw new Error("Annotation layer is not initialized");
    transformer?.nodes([]);
    annotationLayer.destroyChildren();
    layerModels.clear();
    await loadLayers(layers);
    selectedLayerIds = selectedLayerIds.filter((id) => layerModels.has(id));
    updateSelectionPresentation();
  }

  function renderTo(canvas: HTMLCanvasElement): void {
    if (!stage) return;
    const cursorWasVisible = cursorCircle?.visible() ?? false;
    const transformerWasVisible = transformer?.visible() ?? false;
    cursorCircle?.visible(false);
    transformer?.visible(false);
    const snapshot = stage.toCanvas({ pixelRatio: 1 });
    cursorCircle?.visible(cursorWasVisible);
    transformer?.visible(transformerWasVisible);
    canvas.width = stageWidth;
    canvas.height = stageHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot render editor image");
    ctx.drawImage(snapshot, 0, 0, stageWidth, stageHeight);
  }

  function setTool(tool: AnnotateTool): void {
    currentTool = tool;
    if (!stage) return;
    stage.container().style.cursor = tool === "text" || tool === "callout" ? "text" : "none";
    cursorCircle?.visible(currentMode === "draw" && tool !== "text" && tool !== "callout");
  }

  function setMode(mode: AnnotationMode): void {
    currentMode = mode;
    if (!stage) return;
    stage.container().style.cursor = mode === "select" ? "default" : mode === "draw" && (currentTool === "text" || currentTool === "callout") ? "text" : mode === "draw" ? "none" : "default";
    cursorCircle?.visible(mode === "draw" && currentTool !== "text" && currentTool !== "callout");
    updateSelectionPresentation();
  }

  function setOptions(next: Partial<AnnotationOptions>): void {
    Object.assign(options, next);
    updateCursor();
  }

  function setCommitListener(listener: ((layer: EditorLayer) => void) | null): void {
    onCommit = listener;
  }

  function setSelectionListener(listener: ((layerIds: string[]) => void) | null): void {
    onSelection = listener;
  }

  function setTransformListener(listener: ((before: EditorLayer[], after: EditorLayer[]) => void) | null): void {
    onTransform = listener;
  }

  function destroy(): void {
    pendingInput?.remove();
    pendingInput = null;
    stage?.destroy();
    stage = null;
    annotationLayer = null;
    uiLayer = null;
    transformer = null;
    cursorCircle = null;
    activeShape = null;
    isDrawing = false;
    onCommit = null;
    onSelection = null;
    onTransform = null;
    stageWidth = 0;
    stageHeight = 0;
    layerCount = 0;
    layerModels.clear();
    selectedLayerIds = [];
    gestureBefore = null;
    activeDragId = null;
    currentMode = "idle";
  }

  return {
    get width() { return stageWidth; },
    get height() { return stageHeight; },
    init, setMode, setTool, setOptions, loadLayers, replaceLayers, selectLayer, selectLayers,
    setCommitListener, setSelectionListener, setTransformListener, renderTo, destroy,
  };
}
