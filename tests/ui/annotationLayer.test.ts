import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class Shape {
    attrs: Record<string, unknown>;
    parent: Shape | Layer | Stage | null = null;
    destroyed = false;
    constructor(attrs: Record<string, unknown> = {}) { this.attrs = { ...attrs }; }
    remove() { this.parent = null; }
    destroy() { this.destroyed = true; }
    getLayer(): Layer | null { return this.parent instanceof Layer ? this.parent : this.parent instanceof Shape ? this.parent.getLayer() : null; }
    getParent() { return this.parent; }
    id(value?: string) { if (value !== undefined) this.attrs.id = value; return String(this.attrs.id ?? ""); }
    name(value?: string) { if (value !== undefined) this.attrs.name = value; return String(this.attrs.name ?? ""); }
    hasName(value: string) { return this.name().split(" ").includes(value); }
    draggable(value?: boolean) { if (value !== undefined) this.attrs.draggable = value; return Boolean(this.attrs.draggable); }
    x() { return Number(this.attrs.x ?? 0); }
    y() { return Number(this.attrs.y ?? 0); }
    scaleX() { return Number(this.attrs.scaleX ?? 1); }
    scaleY() { return Number(this.attrs.scaleY ?? 1); }
    rotation() { return Number(this.attrs.rotation ?? 0); }
    visible(value?: boolean) { if (value !== undefined) this.attrs.visible = value; return this.attrs.visible !== false; }
  }
  class Line extends Shape {
    points(value?: number[]) {
      if (value) this.attrs.points = value;
      return (this.attrs.points as number[]) ?? [];
    }
  }
  class Rect extends Shape {
    position(value?: { x: number; y: number }) { if (value) Object.assign(this.attrs, value); return { x: Number(this.attrs.x ?? 0), y: Number(this.attrs.y ?? 0) }; }
    size(value?: { width: number; height: number }) { if (value) Object.assign(this.attrs, value); }
    width() { return Number(this.attrs.width ?? 0); }
    height() { return Number(this.attrs.height ?? 0); }
  }
  class Ellipse extends Shape {
    position(value?: { x: number; y: number }) { if (value) Object.assign(this.attrs, value); return { x: Number(this.attrs.x ?? 0), y: Number(this.attrs.y ?? 0) }; }
    radiusX(value?: number) { if (value !== undefined) this.attrs.radiusX = value; return Number(this.attrs.radiusX ?? 0); }
    radiusY(value?: number) { if (value !== undefined) this.attrs.radiusY = value; return Number(this.attrs.radiusY ?? 0); }
  }
  class Circle extends Shape {
    radius(value: number) { this.attrs.radius = value; }
    stroke(value: string) { this.attrs.stroke = value; }
    strokeWidth(value: number) { this.attrs.strokeWidth = value; }
    position(value: { x: number; y: number }) { Object.assign(this.attrs, value); }
  }
  class Layer {
    children: Shape[] = [];
    parent: Stage | null = null;
    add(shape: Shape) { shape.parent = this; this.children.push(shape); }
    findOne(predicate: (node: Shape) => boolean) { return this.children.find(predicate); }
    destroyChildren() { this.children = []; }
    batchDraw = vi.fn();
  }
  class Group extends Shape {
    children: Shape[] = [];
    add(...shapes: Shape[]) { for (const shape of shapes) shape.parent = this; this.children.push(...shapes); }
  }
  class Transformer extends Group {
    selected: Shape[] = [];
    nodes(value?: Shape[]) { if (value) this.selected = value; return this.selected; }
  }
  class Stage {
    content = document.createElement("div");
    handlers = new Map<string, (event: { target: unknown }) => void>();
    layers: Layer[] = [];
    pointer = { x: 10, y: 10 };
    destroyed = false;
    constructor(private readonly config: { container: HTMLDivElement; width: number; height: number }) {
      state.stage = this;
    }
    add(...layers: Layer[]) { for (const layer of layers) layer.parent = this; this.layers.push(...layers); }
    on(events: string, handler: (event: { target: unknown }) => void) {
      for (const event of events.split(" ")) this.handlers.set(event, handler);
    }
    emit(event: string) { this.handlers.get(event)?.({ target: this }); }
    emitFrom(event: string, target: unknown) { this.handlers.get(event)?.({ target }); }
    getPointerPosition() { return this.pointer; }
    container() { return this.config.container; }
    getParent() { return null; }
    hasName() { return false; }
    id() { return ""; }
    width() { return this.config.width; }
    toCanvas() { return document.createElement("canvas"); }
    draw = vi.fn();
    destroy() { this.destroyed = true; }
  }
  const state: { stage: Stage | null } = { stage: null };
  return { state, Stage, Layer, Line, Rect, Ellipse, Circle, Group, Transformer, Shape };
});

vi.mock("konva", () => ({
  default: {
    Stage: mocks.Stage,
    Layer: mocks.Layer,
    Line: mocks.Line,
    Rect: mocks.Rect,
    Ellipse: mocks.Ellipse,
    Arrow: mocks.Line,
    Circle: mocks.Circle,
    Group: mocks.Group,
    Transformer: mocks.Transformer,
    Text: mocks.Shape,
    Image: mocks.Shape,
  },
}));

import { createAnnotationLayer, type AnnotateTool } from "@ui/src/editor/AnnotationLayer";
import { identityTransform, type EditorLayer } from "@ui/src/editor/EditorDocument";

function rect(width: number, height: number): DOMRect {
  return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
}

describe("AnnotationLayer", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"><div id="stage"></div></div>';
    vi.spyOn(document.querySelector<HTMLElement>("#host")!, "getBoundingClientRect").mockReturnValue(rect(400, 300));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.state.stage = null;
  });

  it.each<[AnnotateTool, EditorLayer["kind"]]>([["freehand", "line"], ["line", "line"], ["rect", "rectangle"], ["ellipse", "ellipse"], ["arrow", "arrow"]])("commits a visible %s gesture as an editable %s layer", (tool, expectedKind) => {
    const editor = createAnnotationLayer();
    const listener = vi.fn();
    editor.init(document.querySelector("#stage")!, 800, 600, new Image());
    editor.setMode("draw");
    expect(document.querySelector<HTMLElement>("#stage")!.style.width).toBe("800px");
    expect(document.querySelector<HTMLElement>("#stage")!.style.height).toBe("600px");
    editor.setCommitListener(listener);
    editor.setTool(tool);
    const stage = mocks.state.stage!;
    stage.pointer = { x: 20, y: 30 };
    stage.emit("pointerdown");
    stage.pointer = { x: 100, y: 110 };
    stage.emit("pointermove");
    stage.emit("pointerup");
    expect(listener).toHaveBeenCalledOnce();
    const committed = listener.mock.calls[0]?.[0] as EditorLayer;
    expect(committed).toMatchObject({ kind: expectedKind, visible: true, locked: false, opacity: 1 });
    expect(stage.layers[1]?.children[0]?.attrs.id).toMatch(/^editor-layer-/);
    editor.setMode("select");
    editor.selectLayer(committed.id);
    expect((stage.layers[2]?.children[1] as InstanceType<typeof mocks.Transformer>).selected).toEqual([stage.layers[1]?.children[0]]);
  });

  it("discards a zero-size gesture and commits text once on Enter plus blur", () => {
    const editor = createAnnotationLayer();
    const listener = vi.fn();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    editor.setMode("draw");
    editor.setCommitListener(listener);
    const stage = mocks.state.stage!;
    stage.emit("pointerdown");
    stage.emit("pointerup");
    expect(listener).not.toHaveBeenCalled();

    editor.setTool("text");
    stage.emit("click");
    const input = document.body.querySelector("input")!;
    input.value = "caption";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.dispatchEvent(new Event("blur"));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("creates a callout as an independently editable group", () => {
    const editor = createAnnotationLayer();
    const listener = vi.fn();
    editor.init(document.querySelector("#stage")!, 300, 200, new Image());
    editor.setMode("draw");
    editor.setTool("callout");
    editor.setCommitListener(listener);
    mocks.state.stage!.pointer = { x: 40, y: 50 };
    mocks.state.stage!.emit("click");
    const input = document.body.querySelector("input")!;
    input.value = "Important";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: "callout", text: "Important", width: 240, height: 96 }));
    expect(mocks.state.stage!.layers[1]?.children[0]).toBeInstanceOf(mocks.Group);
  });

  it("cancels pending text, exports without the cursor, and destroys idempotently", () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    editor.setMode("draw");
    editor.setOptions({ color: "#fff", strokeWidth: 8, fontSize: 32 });
    editor.setTool("text");
    mocks.state.stage!.emit("click");
    document.body.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.body.querySelector("input")).toBeNull();

    const drawImage = vi.fn();
    const output = document.createElement("canvas");
    vi.spyOn(output, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    editor.renderTo(output);
    expect(drawImage).toHaveBeenCalled();
    const stage = mocks.state.stage!;
    editor.destroy();
    editor.destroy();
    expect(stage.destroyed).toBe(true);
  });

  it.each<AnnotateTool>(["line", "rect", "ellipse"])("discards a tiny %s gesture", (tool) => {
    const editor = createAnnotationLayer();
    const listener = vi.fn();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    editor.setMode("draw");
    editor.setCommitListener(listener);
    editor.setTool(tool);
    const stage = mocks.state.stage!;
    stage.pointer = { x: 10, y: 10 };
    stage.emit("pointerdown");
    stage.pointer = { x: 10.5, y: 10.5 };
    stage.emit("pointermove");
    stage.emit("pointerup");
    expect(listener).not.toHaveBeenCalled();
  });

  it("draws over existing shapes and ignores a second text click while input is pending", () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    editor.setMode("draw");
    const stage = mocks.state.stage!;
    stage.emitFrom("pointerdown", {});
    expect(stage.layers[1]?.children).toHaveLength(1);
    stage.emit("pointerup");
    editor.setTool("text");
    stage.emit("click");
    stage.emit("click");
    expect(document.body.querySelectorAll("input")).toHaveLength(1);
  });

  it("rebuilds persisted vector layers in their stored order", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const common = (id: string, order: number) => ({ id, name: id, order, visible: true, locked: false, opacity: 1, transform: identityTransform() });
    const layers: EditorLayer[] = [
      { ...common("line", 1), kind: "line", points: [0, 0, 10, 10], stroke: "#fff", strokeWidth: 2, tension: 0.5 },
      { ...common("rect", 0), kind: "rectangle", width: 20, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2 },
      { ...common("text", 2), kind: "text", text: "Caption", fontFamily: "Arial", fontSize: 20, fontWeight: 400, fontStyle: "normal", align: "left", fill: "#fff" },
      { ...common("ellipse", 3), kind: "ellipse", radiusX: 10, radiusY: 5, fill: null, stroke: "#fff", strokeWidth: 2 },
      { ...common("arrow", 4), kind: "arrow", points: [0, 0, 20, 20], stroke: "#fff", strokeWidth: 2, pointerLength: 10, pointerWidth: 8 },
      { ...common("callout", 5), kind: "callout", text: "Note", width: 60, height: 30, fontFamily: "Arial", fontSize: 12, textColor: "#111", fill: "#fff", stroke: "#000", strokeWidth: 1 },
    ];
    await editor.loadLayers(layers);
    const children = mocks.state.stage!.layers[1]!.children;
    expect(children).toHaveLength(6);
    expect(children[0]?.attrs.width).toBe(20);
    expect(children[1]?.attrs.tension).toBe(0.5);
    expect(children[5]).toBeInstanceOf(mocks.Group);
  });

  it("rebuilds text width plus bold and italic font variants", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const layer: EditorLayer = {
      id: "styled-text", name: "Styled text", order: 0, kind: "text", visible: true, locked: false, opacity: 1,
      transform: identityTransform(), text: "Headline", fontFamily: "Georgia", fontSize: 30, fontWeight: 700,
      fontStyle: "italic", align: "center", fill: "#ffffff", width: 160,
    };
    await editor.loadLayers([layer]);
    expect(mocks.state.stage!.layers[1]?.children[0]?.attrs).toMatchObject({ fontStyle: "bold italic", width: 160, align: "center" });
  });

  it("selects an unlocked layer and commits drag or transform geometry", async () => {
    const editor = createAnnotationLayer();
    const selection = vi.fn();
    const transform = vi.fn();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const layer: EditorLayer = {
      id: "rect-one", name: "Rectangle 1", order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1,
      transform: identityTransform(10, 20), width: 40, height: 30, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2,
    };
    await editor.loadLayers([layer]);
    editor.setSelectionListener(selection);
    editor.setTransformListener(transform);
    editor.setMode("select");
    editor.selectLayer(layer.id);

    const stage = mocks.state.stage!;
    const node = stage.layers[1]!.children[0]!;
    const transformer = stage.layers[2]!.children[1] as InstanceType<typeof mocks.Transformer>;
    expect(node.draggable()).toBe(true);
    expect(transformer.selected).toEqual([node]);
    node.attrs.x = 44;
    node.attrs.y = 55;
    stage.emitFrom("dragend", node);
    expect(transform).toHaveBeenCalledWith(layer, expect.objectContaining({ transform: expect.objectContaining({ x: 44, y: 55 }) }));

    stage.emitFrom("pointerdown", node);
    expect(selection).toHaveBeenCalledWith(layer.id);
  });

  it("does not attach the transformer to hidden or locked layers", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const layer: EditorLayer = {
      id: "locked", name: "Locked", order: 0, kind: "rectangle", visible: true, locked: true, opacity: 1,
      transform: identityTransform(), width: 20, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2,
    };
    await editor.loadLayers([layer]);
    editor.setMode("select");
    editor.selectLayer(layer.id);
    const stage = mocks.state.stage!;
    const node = stage.layers[1]!.children[0]!;
    const transformer = stage.layers[2]!.children[1] as InstanceType<typeof mocks.Transformer>;
    expect(node.draggable()).toBe(false);
    expect(transformer.selected).toEqual([]);

    await editor.replaceLayers([{ ...layer, locked: false, visible: false }]);
    editor.selectLayer(layer.id);
    expect(transformer.selected).toEqual([]);
  });
});
