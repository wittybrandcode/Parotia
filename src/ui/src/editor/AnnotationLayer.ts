/**
 * Editable Konva annotation layer. The stage owns the visible image and the
 * annotations; CanvasEngine only receives a rendered snapshot when an image
 * transform is explicitly committed.
 */
import Konva from "konva";
import { createLayerBase, DEFAULT_EDITOR_TEXT_STYLE, type EditorLayer } from "./EditorDocument";
import { snapLayerSelection, type SnapGuide } from "./EditorSnap";
import { bakeTextTransform, editorFontStack, resolveTextDirection } from "./EditorTypography";
import { nextStepNumber, strokeDash } from "./EditorShapeStyles";

export type AnnotateTool = "freehand" | "line" | "rect" | "ellipse" | "arrow" | "text" | "paragraph" | "callout" | "step";
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
  setSnapping(enabled: boolean): void;
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
  let pendingInput: HTMLInputElement | HTMLTextAreaElement | null = null;
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
  let snappingEnabled = true;
  let snapGuides: Konva.Line[] = [];

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

  function committedLayer(shape: Konva.Shape, tool: Exclude<AnnotateTool, "text" | "paragraph" | "callout" | "step">): EditorLayer {
    if (tool === "freehand" || tool === "line") {
      const line = shape as Konva.Line;
      return { ...createLayerBase("line", layerCount), kind: "line", points: [...line.points()], stroke: options.color, strokeWidth: options.strokeWidth, strokeStyle: "solid", tension: tool === "freehand" ? 0.5 : 0 };
    }
    if (tool === "arrow") {
      const arrow = shape as Konva.Arrow;
      return {
        ...createLayerBase("arrow", layerCount), kind: "arrow", points: [...arrow.points()], stroke: options.color,
        strokeWidth: options.strokeWidth, strokeStyle: "solid", pointerLength: Math.max(options.strokeWidth * 3, 10), pointerWidth: Math.max(options.strokeWidth * 2, 8),
        pointerAtBeginning: false, pointerAtEnding: true,
      };
    }
    if (tool === "rect") {
      const rect = shape as Konva.Rect;
      const position = rect.position();
      return {
        ...createLayerBase("rectangle", layerCount, position.x, position.y), kind: "rectangle", width: rect.width(), height: rect.height(),
        cornerRadius: 0, fill: null, stroke: options.color, strokeWidth: options.strokeWidth, strokeStyle: "solid",
      };
    }
    const ellipse = shape as Konva.Ellipse;
    const position = ellipse.position();
    return {
      ...createLayerBase("ellipse", layerCount, position.x, position.y), kind: "ellipse", radiusX: ellipse.radiusX(), radiusY: ellipse.radiusY(),
      fill: null, stroke: options.color, strokeWidth: options.strokeWidth, strokeStyle: "solid",
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
      case "paragraph":
        return new Konva.Rect({ ...base, x: pos.x, y: pos.y, width: 0, height: 0, dash: [6, 4] });
      case "ellipse":
        return new Konva.Ellipse({ ...base, x: pos.x, y: pos.y, radiusX: 0, radiusY: 0 });
      case "arrow":
        return new Konva.Arrow({ ...base, points: [pos.x, pos.y, pos.x, pos.y], fill: options.color, pointerLength: Math.max(options.strokeWidth * 3, 10), pointerWidth: Math.max(options.strokeWidth * 2, 8) });
      case "text":
      case "callout":
      case "step":
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
    const requiresUniformTransform = nodes.some((node) => {
      const kind = layerModels.get(node.id())?.kind;
      return kind === "text" || kind === "group";
    });
    transformer?.nodes(nodes);
    if (transformer && typeof transformer.keepRatio === "function") transformer.keepRatio(requiresUniformTransform);
    if (transformer && typeof transformer.enabledAnchors === "function") transformer.enabledAnchors(requiresUniformTransform
      ? ["top-left", "top-right", "bottom-left", "bottom-right"]
      : ["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"]);
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
    clearSnapGuides();
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
    const rawDeltaX = node.x() - origin.transform.x;
    const rawDeltaY = node.y() - origin.transform.y;
    const sourceEvent = event.evt as DragEvent | undefined;
    const movingLayers = [...(gestureBefore?.values() ?? [])];
    const stationaryLayers = [...layerModels.values()].filter((layer) => !gestureBefore?.has(layer.id) && layer.visible);
    const renderedWidth = stage?.container().getBoundingClientRect().width ?? 0;
    const displayScale = renderedWidth > 0 ? renderedWidth / stageWidth : 1;
    const snapped = snappingEnabled && !sourceEvent?.altKey
      ? snapLayerSelection(movingLayers, stationaryLayers, { width: stageWidth, height: stageHeight }, rawDeltaX, rawDeltaY, 6 / Math.max(displayScale, 0.01))
      : { deltaX: rawDeltaX, deltaY: rawDeltaY, guides: [] };
    showSnapGuides(snapped.guides);
    for (const [otherId, before] of gestureBefore ?? []) {
      layerNode(otherId)?.position({ x: before.transform.x + snapped.deltaX, y: before.transform.y + snapped.deltaY });
    }
    annotationLayer?.batchDraw();
  }

  function onGestureEnd(): void {
    clearSnapGuides();
    if (!gestureBefore) return;
    const before = [...gestureBefore.values()];
    gestureBefore = null;
    activeDragId = null;
    const after = before.map((model) => {
      const node = layerNode(model.id);
      if (!node) return model;
      const transform = { x: node.x(), y: node.y(), scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation() };
      const transformed: EditorLayer = model.kind === "text" ? bakeTextTransform(model, transform) : { ...model, transform };
      layerModels.set(model.id, transformed);
      return transformed;
    });
    if (before.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(after[index]))) onTransform?.(before, after);
  }

  function onPointerDown(event: Konva.KonvaEventObject<PointerEvent>): void {
    clearSnapGuides();
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
    if (currentTool === "text" || currentTool === "callout" || currentTool === "step") return;
    startX = pos.x;
    startY = pos.y;
    activeShape = makeShape(pos);
    if (!activeShape) return;
    annotationLayer.add(activeShape);
    isDrawing = true;
    annotationLayer.batchDraw();
  }

  function onTextActivate(): void {
    if (currentMode !== "draw" || pendingInput || (currentTool !== "text" && currentTool !== "callout" && currentTool !== "step")) return;
    const pos = pointer();
    if (currentTool === "step") placeStep(pos.x, pos.y);
    else placeText(pos.x, pos.y, currentTool);
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
    } else if (currentTool === "rect" || currentTool === "paragraph") {
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
    if (currentTool === "paragraph") {
      const paragraphBox = shape as Konva.Rect;
      const position = paragraphBox.position();
      const width = paragraphBox.width() >= 24 ? paragraphBox.width() : Math.min(360, Math.max(240, stageWidth - position.x - 24));
      const height = paragraphBox.height() >= 24 ? paragraphBox.height() : Math.min(180, Math.max(96, stageHeight - position.y - 24));
      shape.destroy();
      placeText(position.x, position.y, "paragraph", { width, height });
    } else if (shouldDiscard(shape)) shape.destroy();
    else {
      const layer = committedLayer(shape, currentTool as Exclude<AnnotateTool, "text" | "paragraph" | "callout" | "step">);
      shape.id(layer.id);
      shape.name(`editor-layer ${layer.kind}`);
      layerModels.set(layer.id, layer);
      onCommit?.(layer);
      layerCount += 1;
    }
    annotationLayer.batchDraw();
  }

  function placeText(x: number, y: number, kind: "text" | "paragraph" | "callout", box?: { width: number; height: number }): void {
    if (!stage || !annotationLayer || pendingInput) return;
    const rect = stage.container().getBoundingClientRect();
    const scale = rect.width / stage.width();
    const input = document.createElement(kind === "paragraph" ? "textarea" : "input");
    let finished = false;
    pendingInput = input;
    input.className = "nc-editor-inline-text-input";
    input.setAttribute("aria-label", kind === "text" ? "Enter point text" : kind === "paragraph" ? "Enter paragraph text" : "Enter callout text");
    input.setAttribute("dir", "auto");
    input.placeholder = kind === "text" ? "Type point text…" : kind === "paragraph" ? "Type paragraph text…  Ctrl+Enter to finish" : "Type callout…";
    const isParagraph = kind === "paragraph";
    Object.assign(input.style, {
      position: "fixed", left: `${rect.left + x * scale}px`, top: `${rect.top + (isParagraph ? y : y - options.fontSize / 2) * scale}px`,
      fontSize: `${options.fontSize * scale}px`, color: options.color, background: "rgba(0,0,0,0.75)",
      border: `1px solid ${options.color}`, borderRadius: "4px", padding: "2px 6px", outline: "none", minWidth: "80px", zIndex: "2147483647",
      ...(isParagraph && box ? { width: `${box.width * scale}px`, height: `${box.height * scale}px`, resize: "none", lineHeight: "1.2" } : {}),
    });
    const finish = (save: boolean): void => {
      if (finished) return;
      finished = true;
      const text = input.value.trim();
      if (save && text && kind === "text") {
        const textY = y - options.fontSize / 2;
        const layer: EditorLayer = {
          ...createLayerBase("text", layerCount, x, textY), ...DEFAULT_EDITOR_TEXT_STYLE, kind: "text", text,
          fontSize: options.fontSize, fill: options.color,
        };
        addShape(new Konva.Text({ x, y: textY, text, fontSize: options.fontSize, fontFamily: "sans-serif", fill: options.color, draggable: false }), layer);
      } else if (save && text && kind === "paragraph" && box) {
        const layer: EditorLayer = {
          ...createLayerBase("text", layerCount, x, y), ...DEFAULT_EDITOR_TEXT_STYLE, kind: "text", textMode: "paragraph", text,
          width: box.width, height: box.height, fontSize: options.fontSize, fill: options.color,
        };
        const group = new Konva.Group({ x, y, draggable: false });
        group.add(new Konva.Text({ text, width: box.width, height: box.height, fontSize: options.fontSize, fontFamily: "sans-serif", fill: options.color, wrap: "word" }));
        addShape(group, layer);
      } else if (save && text) {
        const width = 240;
        const height = 96;
        const layer: EditorLayer = {
          ...createLayerBase("callout", layerCount, x, y), kind: "callout", text, width, height,
          fontFamily: "sans-serif", fontSize: options.fontSize, textColor: "#111111", fill: options.color,
          stroke: options.color, strokeWidth: Math.max(1, options.strokeWidth), strokeStyle: "solid", cornerRadius: 6,
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
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Enter" && (!isParagraph || keyboardEvent.ctrlKey || keyboardEvent.metaKey)) { keyboardEvent.preventDefault(); finish(true); }
      if (keyboardEvent.key === "Escape") { keyboardEvent.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
    document.body.appendChild(input);
    input.focus();
  }

  function placeStep(x: number, y: number): void {
    const number = nextStepNumber([...layerModels.values()]);
    const radius = Math.max(18, options.fontSize * 0.7);
    const layer: EditorLayer = {
      ...createLayerBase("step", layerCount, x, y), kind: "step", name: `Step ${number}`, number, radius,
      fill: options.color, stroke: "#111111", strokeWidth: Math.max(2, options.strokeWidth), strokeStyle: "solid",
      fontFamily: "sans-serif", fontSize: Math.max(14, options.fontSize * 0.8), textColor: "#111111",
    };
    const group = new Konva.Group({ x, y, draggable: false });
    group.add(
      new Konva.Circle({ radius, fill: options.color, stroke: "#111111", strokeWidth: Math.max(2, options.strokeWidth) }),
      new Konva.Text({ x: -radius, y: -radius, width: radius * 2, height: radius * 2, text: String(number), fontFamily: "sans-serif", fontSize: layer.fontSize, fontStyle: "bold", fill: "#111111", align: "center", verticalAlign: "middle" }),
    );
    addShape(group, layer);
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
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315], rotationSnapTolerance: 5,
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

  function clearSnapGuides(): void {
    for (const guide of snapGuides) guide.destroy();
    snapGuides = [];
    uiLayer?.batchDraw();
  }

  function showSnapGuides(guides: SnapGuide[]): void {
    clearSnapGuides();
    if (!uiLayer) return;
    snapGuides = guides.map((guide) => new Konva.Line({
      points: guide.axis === "vertical" ? [guide.position, 0, guide.position, stageHeight] : [0, guide.position, stageWidth, guide.position],
      stroke: guide.source === "canvas" ? "#c1e899" : "#75bfff", strokeWidth: 1, dash: [6, 4], listening: false, name: "editor-snap-guide",
    }));
    for (const guide of snapGuides) uiLayer.add(guide);
    uiLayer.batchDraw();
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
          const contentWidth = layer.width === undefined ? undefined : Math.max(1, layer.width - layer.padding * 2);
          const contentHeight = layer.height === undefined ? undefined : Math.max(1, layer.height - layer.padding * 2);
          const text = new Konva.Text({
            x: layer.padding, y: layer.padding, text: layer.text, fontFamily: editorFontStack(layer.fontFamily, layer.fontFallback),
            fontSize: layer.fontSize, fontStyle, direction: resolveTextDirection(layer.text, layer.direction), align: layer.align,
            verticalAlign: layer.verticalAlign, fill: layer.fill, lineHeight: layer.lineHeight, letterSpacing: layer.letterSpacing,
            wrap: layer.textMode === "paragraph" ? "word" : "none", ...(contentWidth === undefined ? {} : { width: contentWidth }), ...(contentHeight === undefined ? {} : { height: contentHeight }),
            ...(layer.shadowColor === null ? {} : {
              shadowColor: layer.shadowColor, shadowBlur: layer.shadowBlur,
              shadowOffset: { x: layer.shadowOffsetX, y: layer.shadowOffsetY }, shadowEnabled: true,
            }),
          });
          const width = layer.width ?? text.width() + layer.padding * 2;
          const height = layer.height ?? text.height() + layer.padding * 2;
          const group = new Konva.Group(common);
          if (layer.backgroundColor !== null || layer.borderColor !== null) group.add(new Konva.Rect({
            width, height, ...(layer.backgroundColor === null ? {} : { fill: layer.backgroundColor }),
            ...(layer.borderColor === null ? {} : { stroke: layer.borderColor, strokeWidth: layer.borderWidth }), cornerRadius: layer.cornerRadius,
          }));
          group.add(text);
          return group;
        }
      case "rectangle":
        return new Konva.Rect({ ...common, width: layer.width, height: layer.height, cornerRadius: layer.cornerRadius, ...(layer.fill === null ? {} : { fill: layer.fill }), stroke: layer.stroke, strokeWidth: layer.strokeWidth, dash: strokeDash(layer.strokeStyle, layer.strokeWidth) });
      case "ellipse":
        return new Konva.Ellipse({ ...common, radiusX: layer.radiusX, radiusY: layer.radiusY, ...(layer.fill === null ? {} : { fill: layer.fill }), stroke: layer.stroke, strokeWidth: layer.strokeWidth, dash: strokeDash(layer.strokeStyle, layer.strokeWidth) });
      case "line":
        return new Konva.Line({ ...common, points: layer.points, stroke: layer.stroke, strokeWidth: layer.strokeWidth, dash: strokeDash(layer.strokeStyle, layer.strokeWidth), tension: layer.tension, lineCap: "round", lineJoin: "round" });
      case "arrow":
        return new Konva.Arrow({ ...common, points: layer.points, stroke: layer.stroke, fill: layer.stroke, strokeWidth: layer.strokeWidth, dash: strokeDash(layer.strokeStyle, layer.strokeWidth), pointerLength: layer.pointerLength, pointerWidth: layer.pointerWidth, pointerAtBeginning: layer.pointerAtBeginning, pointerAtEnding: layer.pointerAtEnding });
      case "callout": {
        const group = new Konva.Group(common);
        group.add(
          new Konva.Rect({ width: layer.width, height: layer.height, ...(layer.fill === null ? {} : { fill: layer.fill }), stroke: layer.stroke, strokeWidth: layer.strokeWidth, dash: strokeDash(layer.strokeStyle, layer.strokeWidth), cornerRadius: layer.cornerRadius }),
          new Konva.Text({ text: layer.text, width: layer.width, height: layer.height, padding: 8, fontFamily: layer.fontFamily, fontSize: layer.fontSize, fill: layer.textColor, verticalAlign: "middle", align: "center" }),
        );
        return group;
      }
      case "step": {
        const group = new Konva.Group(common);
        group.add(
          new Konva.Circle({ radius: layer.radius, ...(layer.fill === null ? {} : { fill: layer.fill }), stroke: layer.stroke, strokeWidth: layer.strokeWidth, dash: strokeDash(layer.strokeStyle, layer.strokeWidth) }),
          new Konva.Text({ x: -layer.radius, y: -layer.radius, width: layer.radius * 2, height: layer.radius * 2, text: String(layer.number), fontFamily: layer.fontFamily, fontSize: layer.fontSize, fontStyle: "bold", fill: layer.textColor, align: "center", verticalAlign: "middle" }),
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
    clearSnapGuides();
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
    stage.container().style.cursor = tool === "text" || tool === "paragraph" || tool === "callout" ? "text" : tool === "step" ? "crosshair" : "none";
    cursorCircle?.visible(currentMode === "draw" && tool !== "text" && tool !== "paragraph" && tool !== "callout" && tool !== "step");
  }

  function setMode(mode: AnnotationMode): void {
    currentMode = mode;
    if (mode !== "select") clearSnapGuides();
    if (!stage) return;
    stage.container().style.cursor = mode === "select" ? "default" : mode === "draw" && (currentTool === "text" || currentTool === "paragraph" || currentTool === "callout") ? "text" : mode === "draw" && currentTool === "step" ? "crosshair" : mode === "draw" ? "none" : "default";
    cursorCircle?.visible(mode === "draw" && currentTool !== "text" && currentTool !== "paragraph" && currentTool !== "callout" && currentTool !== "step");
    updateSelectionPresentation();
  }

  function setOptions(next: Partial<AnnotationOptions>): void {
    Object.assign(options, next);
    updateCursor();
  }

  function setSnapping(enabled: boolean): void {
    snappingEnabled = enabled;
    if (!enabled) clearSnapGuides();
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
    snapGuides = [];
    snappingEnabled = true;
    currentMode = "idle";
  }

  return {
    get width() { return stageWidth; },
    get height() { return stageHeight; },
    init, setMode, setTool, setOptions, loadLayers, replaceLayers, selectLayer, selectLayers, setSnapping,
    setCommitListener, setSelectionListener, setTransformListener, renderTo, destroy,
  };
}
