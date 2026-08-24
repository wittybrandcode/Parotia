/**
 * Editable Konva annotation layer. The stage owns the visible image and the
 * annotations; CanvasEngine only receives a rendered snapshot when an image
 * transform is explicitly committed.
 */
import Konva from "konva";

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
  setCommitListener(listener: (() => void) | null): void;
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
  const options = { ...DEFAULT_OPTIONS };

  let onCommit: (() => void) | null = null;

  function pointer(): { x: number; y: number } {
    return stage?.getPointerPosition() ?? { x: 0, y: 0 };
  }

  function updateCursor(): void {
    if (!cursorCircle) return;
    cursorCircle.radius(Math.max(options.strokeWidth / 2, 2));
    cursorCircle.stroke(options.color);
    cursorCircle.strokeWidth(1);
  }

  function addShape(shape: Konva.Shape): void {
    annotationLayer?.add(shape);
    annotationLayer?.batchDraw();
    onCommit?.();
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
      onCommit?.();
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
      if (save && text) addShape(new Konva.Text({ x, y: y - options.fontSize / 2, text, fontSize: options.fontSize, fontFamily: "sans-serif", fill: options.color, draggable: false }));
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

  function setCommitListener(listener: (() => void) | null): void {
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
  }

  return {
    get width() { return stageWidth; },
    get height() { return stageHeight; },
    init, setTool, setOptions, setCommitListener, renderTo, destroy,
  };
}
