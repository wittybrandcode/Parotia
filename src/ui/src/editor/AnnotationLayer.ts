/**
 * Editable Konva annotation layer. The stage owns the visible image and the
 * annotations; CanvasEngine only receives a rendered snapshot when an image
 * transform is explicitly committed.
 */
import Konva from "konva";
import { createLayerBase, type EditorLayer } from "./EditorDocument";

export type AnnotateTool = "freehand" | "line" | "rect" | "ellipse" | "arrow" | "text";

export interface AnnotationOptions {
  color: string;
  strokeWidth: number;
  fontSize: number;
}

export interface AnnotationLayer {
  readonly width: number;
  readonly height: number;
  init(container: HTMLDivElement, width: number, height: number, backgroundImage: HTMLImageElement): void;
  setTool(tool: AnnotateTool): void;
  setOptions(opts: Partial<AnnotationOptions>): void;
  loadLayers(layers: EditorLayer[]): Promise<void>;
  setCommitListener(listener: ((layer: EditorLayer) => void) | null): void;
  renderTo(canvas: HTMLCanvasElement): void;
  destroy(): void;
}

const DEFAULT_OPTIONS: AnnotationOptions = { color: "#c1e899", strokeWidth: 3, fontSize: 24 };

export function createAnnotationLayer(): AnnotationLayer {
  let stage: Konva.Stage | null = null;
  let annotationLayer: Konva.Layer | null = null;
  let cursorCircle: Konva.Circle | null = null;
  let activeShape: Konva.Shape | null = null;
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentTool: AnnotateTool = "freehand";
  let pendingInput: HTMLInputElement | null = null;
  let stageWidth = 0;
  let stageHeight = 0;
  let layerCount = 0;
  const options = { ...DEFAULT_OPTIONS };

  let onCommit: ((layer: EditorLayer) => void) | null = null;

  function pointer(): { x: number; y: number } {
    return stage?.getPointerPosition() ?? { x: 0, y: 0 };
  }

  function updateCursor(): void {
    if (!cursorCircle) return;
    cursorCircle.radius(Math.max(options.strokeWidth / 2, 2));
    cursorCircle.stroke(options.color);
    cursorCircle.strokeWidth(1);
  }

  function addShape(shape: Konva.Shape, layer: EditorLayer): void {
    shape.id(layer.id);
    shape.name(`editor-layer ${layer.kind}`);
    annotationLayer?.add(shape);
    annotationLayer?.batchDraw();
    layerCount += 1;
    onCommit?.(layer);
  }

  function committedLayer(shape: Konva.Shape, tool: Exclude<AnnotateTool, "text">): EditorLayer {
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
        return null;
    }
  }

  function onPointerDown(event: Konva.KonvaEventObject<PointerEvent>): void {
    if (!stage || !annotationLayer || pendingInput) return;
    // The background is non-listening, so a canvas click targets the stage.
    // Existing annotations are not accidentally drawn over.
    if (event.target !== stage) return;
    const pos = pointer();
    if (currentTool === "text") {
      placeText(pos.x, pos.y);
      return;
    }
    startX = pos.x;
    startY = pos.y;
    activeShape = makeShape(pos);
    if (!activeShape) return;
    annotationLayer.add(activeShape);
    isDrawing = true;
    annotationLayer.batchDraw();
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
      const layer = committedLayer(shape, currentTool as Exclude<AnnotateTool, "text">);
      shape.id(layer.id);
      shape.name(`editor-layer ${layer.kind}`);
      onCommit?.(layer);
      layerCount += 1;
    }
    annotationLayer.batchDraw();
  }

  function placeText(x: number, y: number): void {
    if (!stage || !annotationLayer || pendingInput) return;
    const rect = stage.container().getBoundingClientRect();
    const scale = rect.width / stage.width();
    const input = document.createElement("input");
    let finished = false;
    pendingInput = input;
    Object.assign(input.style, {
      position: "fixed", left: `${rect.left + x * scale}px`, top: `${rect.top + (y - options.fontSize / 2) * scale}px`,
      fontSize: `${options.fontSize * scale}px`, color: options.color, background: "rgba(0,0,0,0.75)",
      border: `1px solid ${options.color}`, borderRadius: "4px", padding: "2px 6px", outline: "none", minWidth: "80px", zIndex: "2147483647",
    });
    const finish = (save: boolean): void => {
      if (finished) return;
      finished = true;
      const text = input.value.trim();
      if (save && text) {
        const textY = y - options.fontSize / 2;
        const layer: EditorLayer = {
          ...createLayerBase("text", layerCount, x, textY), kind: "text", text, fontSize: options.fontSize,
          fontFamily: "sans-serif", fontWeight: 400, fontStyle: "normal", align: "left", fill: options.color,
        };
        addShape(new Konva.Text({ x, y: textY, text, fontSize: options.fontSize, fontFamily: "sans-serif", fill: options.color, draggable: false }), layer);
      }
      input.remove();
      pendingInput = null;
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
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
    const uiLayer = new Konva.Layer({ listening: false });
    stage.add(backgroundLayer, annotationLayer, uiLayer);
    backgroundLayer.add(new Konva.Image({ image: backgroundImage, width, height, listening: false }));
    cursorCircle = new Konva.Circle({ x: -100, y: -100, visible: false, listening: false });
    uiLayer.add(cursorCircle);
    stage.on("pointerdown", onPointerDown);
    stage.on("pointermove", onPointerMove);
    stage.on("pointerup pointercancel", onPointerUp);
    setTool("freehand");
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
    }
  }

  async function loadLayers(layers: EditorLayer[]): Promise<void> {
    if (!annotationLayer) throw new Error("Annotation layer is not initialized");
    for (const layer of [...layers].sort((a, b) => a.order - b.order)) annotationLayer.add(await nodeFromLayer(layer));
    layerCount = layers.length;
    annotationLayer.batchDraw();
  }

  function renderTo(canvas: HTMLCanvasElement): void {
    if (!stage) return;
    const cursorWasVisible = cursorCircle?.visible() ?? false;
    cursorCircle?.visible(false);
    const snapshot = stage.toCanvas({ pixelRatio: 1 });
    cursorCircle?.visible(cursorWasVisible);
    canvas.width = stageWidth;
    canvas.height = stageHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot render editor image");
    ctx.drawImage(snapshot, 0, 0, stageWidth, stageHeight);
  }

  function setTool(tool: AnnotateTool): void {
    currentTool = tool;
    if (!stage) return;
    stage.container().style.cursor = tool === "text" ? "text" : "none";
    cursorCircle?.visible(tool !== "text");
  }

  function setOptions(next: Partial<AnnotationOptions>): void {
    Object.assign(options, next);
    updateCursor();
  }

  function setCommitListener(listener: ((layer: EditorLayer) => void) | null): void {
    onCommit = listener;
  }

  function destroy(): void {
    pendingInput?.remove();
    pendingInput = null;
    stage?.destroy();
    stage = null;
    annotationLayer = null;
    cursorCircle = null;
    activeShape = null;
    isDrawing = false;
    onCommit = null;
    stageWidth = 0;
    stageHeight = 0;
    layerCount = 0;
  }

  return {
    get width() { return stageWidth; },
    get height() { return stageHeight; },
    init, setTool, setOptions, loadLayers, setCommitListener, renderTo, destroy,
  };
}
