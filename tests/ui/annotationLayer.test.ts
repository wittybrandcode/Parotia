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
    position(value?: { x: number; y: number }) { if (value) Object.assign(this.attrs, value); return { x: Number(this.attrs.x ?? 0), y: Number(this.attrs.y ?? 0) }; }
    x() { return Number(this.attrs.x ?? 0); }
    y() { return Number(this.attrs.y ?? 0); }
    scaleX(value?: number) { if (value !== undefined) this.attrs.scaleX = value; return Number(this.attrs.scaleX ?? 1); }
    scaleY(value?: number) { if (value !== undefined) this.attrs.scaleY = value; return Number(this.attrs.scaleY ?? 1); }
    rotation() { return Number(this.attrs.rotation ?? 0); }
    visible(value?: boolean) { if (value !== undefined) this.attrs.visible = value; return this.attrs.visible !== false; }
    width(value?: number) { if (value !== undefined) this.attrs.width = value; return Number(this.attrs.width ?? 0); }
    height(value?: number) { if (value !== undefined) this.attrs.height = value; return Number(this.attrs.height ?? 0); }
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
    position(value?: { x: number; y: number }) { if (value) Object.assign(this.attrs, value); return { x: Number(this.attrs.x ?? 0), y: Number(this.attrs.y ?? 0) }; }
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
    getChildren() { return this.children; }
  }
  class Transformer extends Group {
    selected: Shape[] = [];
    preserveRatio = false;
    anchors: string[] = [];
    nodes(value?: Shape[]) { if (value) this.selected = value; return this.selected; }
    keepRatio(value?: boolean) { if (value !== undefined) this.preserveRatio = value; return this.preserveRatio; }
    enabledAnchors(value?: string[]) { if (value) this.anchors = value; return this.anchors; }
    forceUpdate = vi.fn();
  }
  class Stage {
    content = document.createElement("div");
    handlers = new Map<string, (event: { target: unknown; type: string; evt?: Record<string, boolean> }) => void>();
    layers: Layer[] = [];
    pointer = { x: 10, y: 10 };
    destroyed = false;
    constructor(private readonly config: { container: HTMLDivElement; width: number; height: number }) {
      state.stage = this;
    }
    add(...layers: Layer[]) { for (const layer of layers) layer.parent = this; this.layers.push(...layers); }
    on(events: string, handler: (event: { target: unknown; type: string; evt?: Record<string, boolean> }) => void) {
      for (const event of events.split(" ")) this.handlers.set(event, handler);
    }
    emit(event: string) { this.handlers.get(event)?.({ target: this, type: event }); }
    emitFrom(event: string, target: unknown, evt?: Record<string, boolean>) { this.handlers.get(event)?.({ target, type: event, ...(evt ? { evt } : {}) }); }
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
import { DEFAULT_EDITOR_TEXT_STYLE, identityTransform, type EditorLayer } from "@ui/src/editor/EditorDocument";

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

  it("creates paragraph text by dragging a box and keeps Enter available for new lines", () => {
    const editor = createAnnotationLayer();
    const listener = vi.fn();
    editor.init(document.querySelector("#stage")!, 400, 300, new Image());
    editor.setMode("draw");
    editor.setTool("paragraph");
    editor.setCommitListener(listener);
    const stage = mocks.state.stage!;
    stage.pointer = { x: 30, y: 40 };
    stage.emit("pointerdown");
    stage.pointer = { x: 270, y: 160 };
    stage.emit("pointermove");
    stage.emit("pointerup");

    const input = document.body.querySelector("textarea")!;
    expect(input).not.toBeNull();
    input.value = "First line\nSecond line";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(listener).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: "text", textMode: "paragraph", width: 240, height: 120 }));
  });

  it("creates consecutive editable step markers with automatic numbering", () => {
    const editor = createAnnotationLayer();
    const listener = vi.fn();
    editor.init(document.querySelector("#stage")!, 300, 200, new Image());
    editor.setMode("draw");
    editor.setTool("step");
    editor.setCommitListener(listener);
    mocks.state.stage!.pointer = { x: 40, y: 50 };
    mocks.state.stage!.emit("click");
    mocks.state.stage!.pointer = { x: 90, y: 100 };
    mocks.state.stage!.emit("click");

    expect(listener.mock.calls.map((call) => (call[0] as EditorLayer).kind === "step" ? (call[0] as Extract<EditorLayer, { kind: "step" }>).number : 0)).toEqual([1, 2]);
    expect(mocks.state.stage!.layers[1]?.children).toHaveLength(2);
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
      { ...common("line", 1), kind: "line", points: [0, 0, 10, 10], stroke: "#fff", strokeWidth: 2, strokeStyle: "solid", tension: 0.5 },
      { ...common("rect", 0), kind: "rectangle", width: 20, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2, strokeStyle: "solid" },
      { ...common("text", 2), ...DEFAULT_EDITOR_TEXT_STYLE, kind: "text", text: "Caption", fontFamily: "Arial", fontSize: 20, fill: "#fff" },
      { ...common("ellipse", 3), kind: "ellipse", radiusX: 10, radiusY: 5, fill: null, stroke: "#fff", strokeWidth: 2, strokeStyle: "solid" },
      { ...common("arrow", 4), kind: "arrow", points: [0, 0, 20, 20], stroke: "#fff", strokeWidth: 2, strokeStyle: "solid", pointerLength: 10, pointerWidth: 8, pointerAtBeginning: false, pointerAtEnding: true },
      { ...common("callout", 5), kind: "callout", text: "Note", width: 60, height: 30, cornerRadius: 6, fontFamily: "Arial", fontSize: 12, textColor: "#111", fill: "#fff", stroke: "#000", strokeWidth: 1, strokeStyle: "solid" },
      { ...common("step", 6), kind: "step", number: 3, radius: 18, fontFamily: "Arial", fontSize: 14, textColor: "#111", fill: "#fff", stroke: "#000", strokeWidth: 2, strokeStyle: "dotted" },
    ];
    await editor.loadLayers(layers);
    const children = mocks.state.stage!.layers[1]!.children;
    expect(children).toHaveLength(7);
    expect(children[0]?.attrs.width).toBe(20);
    expect(children[1]?.attrs.tension).toBe(0.5);
    expect(children[5]).toBeInstanceOf(mocks.Group);
    expect(children[6]).toBeInstanceOf(mocks.Group);
    expect((children[6] as InstanceType<typeof mocks.Group>).children[0]?.attrs).toMatchObject({ radius: 18, dash: [2, 4] });
  });

  it("rebuilds text width plus bold and italic font variants", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const layer: EditorLayer = {
      id: "styled-text", name: "Styled text", order: 0, kind: "text", visible: true, locked: false, opacity: 1,
      transform: identityTransform(), ...DEFAULT_EDITOR_TEXT_STYLE, text: "Headline", fontFamily: "Georgia", fontSize: 30, fontWeight: 700,
      textMode: "paragraph", fontStyle: "italic", align: "center", fill: "#ffffff", width: 160, height: 80,
    };
    await editor.loadLayers([layer]);
    const textGroup = mocks.state.stage!.layers[1]?.children[0] as InstanceType<typeof mocks.Group>;
    expect(textGroup.children[0]?.attrs).toMatchObject({ fontStyle: "bold italic", width: 160, align: "center" });
  });

  it("uses corner-only proportional text transforms and bakes resizing into typography", async () => {
    const editor = createAnnotationLayer();
    const transform = vi.fn();
    editor.init(document.querySelector("#stage")!, 400, 300, new Image());
    const layer: EditorLayer = {
      id: "point-text", name: "Point text", order: 0, kind: "text", visible: true, locked: false, opacity: 1,
      transform: identityTransform(20, 30), ...DEFAULT_EDITOR_TEXT_STYLE, text: "Scale safely", fontSize: 20,
    };
    await editor.loadLayers([layer]);
    editor.setTransformListener(transform);
    editor.setMode("select");
    editor.selectLayer(layer.id);
    const stage = mocks.state.stage!;
    const node = stage.layers[1]!.children[0]!;
    const transformer = stage.layers[2]!.children[1] as InstanceType<typeof mocks.Transformer>;
    expect(transformer.preserveRatio).toBe(true);
    expect(transformer.anchors).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);

    stage.emitFrom("transformstart", node);
    node.scaleX(2);
    node.scaleY(1.25);
    stage.emitFrom("transformend", node);
    expect(transform).toHaveBeenCalledWith([layer], [expect.objectContaining({
      fontSize: 40,
      transform: expect.objectContaining({ scaleX: 1, scaleY: 1 }),
    })]);
  });

  it("uses all paragraph handles to resize only the reflow box", async () => {
    const editor = createAnnotationLayer();
    const transform = vi.fn();
    editor.init(document.querySelector("#stage")!, 400, 300, new Image());
    const layer: EditorLayer = {
      id: "paragraph-text", name: "Paragraph text", order: 0, kind: "text", visible: true, locked: false, opacity: 1,
      transform: identityTransform(20, 30), ...DEFAULT_EDITOR_TEXT_STYLE, textMode: "paragraph", text: "Text that reflows",
      width: 200, height: 100, fontSize: 20, padding: 8, letterSpacing: 1,
    };
    await editor.loadLayers([layer]);
    editor.setTransformListener(transform);
    editor.setMode("select");
    editor.selectLayer(layer.id);
    const stage = mocks.state.stage!;
    const node = stage.layers[1]!.children[0]!;
    const transformer = stage.layers[2]!.children[1] as InstanceType<typeof mocks.Transformer>;
    expect(transformer.preserveRatio).toBe(false);
    expect(transformer.anchors).toEqual(["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"]);

    stage.emitFrom("transformstart", node);
    node.scaleX(1.5);
    node.scaleY(2);
    stage.emitFrom("transform", node);
    expect(node.scaleX()).toBe(1);
    expect(node.scaleY()).toBe(1);
    const paragraphGroup = node as InstanceType<typeof mocks.Group>;
    expect(paragraphGroup.children.find((child) => child.hasName("editor-text-content"))?.attrs).toMatchObject({ width: 284, height: 184 });
    stage.emitFrom("transformend", node);
    expect(transform).toHaveBeenCalledWith([layer], [expect.objectContaining({
      width: 300, height: 200, fontSize: 20, padding: 8, letterSpacing: 1,
      transform: expect.objectContaining({ scaleX: 1, scaleY: 1 }),
    })]);
  });

  it("renders an editable multiline RTL text box with background, border and shadow", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 400, 300, new Image());
    const layer: EditorLayer = {
      id: "arabic-text", name: "Arabic text", order: 0, kind: "text", visible: true, locked: false, opacity: 0.9,
      transform: identityTransform(12, 18), ...DEFAULT_EDITOR_TEXT_STYLE, text: "مرحبا\nبالعالم", fontFamily: "Noto Sans Arabic",
      fontFallback: "sans-serif", direction: "auto", align: "right", verticalAlign: "middle", width: 220, height: 100,
      lineHeight: 1.4, letterSpacing: 0.5, padding: 10, backgroundColor: "#111111", borderColor: "#eeeeee",
      borderWidth: 2, cornerRadius: 8, shadowColor: "#000000", shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 3,
    };
    await editor.loadLayers([layer]);
    const group = mocks.state.stage!.layers[1]?.children[0] as InstanceType<typeof mocks.Group>;
    expect(group.attrs).toMatchObject({ id: "arabic-text", x: 12, y: 18, opacity: 0.9 });
    expect(group.children[0]?.attrs).toMatchObject({ width: 220, height: 100, fill: "#111111", stroke: "#eeeeee", strokeWidth: 2, cornerRadius: 8 });
    expect(group.children[1]?.attrs).toMatchObject({
      text: "مرحبا\nبالعالم", direction: "rtl", align: "right", verticalAlign: "middle", width: 200, height: 80,
      lineHeight: 1.4, letterSpacing: 0.5, shadowColor: "#000000", shadowBlur: 4, shadowOffset: { x: 2, y: 3 },
    });
  });

  it("installs the professional paragraph renderer only for justified text", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 400, 300, new Image());
    const layer: EditorLayer = {
      id: "justified-text", name: "Justified text", order: 0, kind: "text", visible: true, locked: false, opacity: 1,
      transform: identityTransform(), ...DEFAULT_EDITOR_TEXT_STYLE, textMode: "paragraph", text: "A paragraph with a final line",
      width: 240, height: 120, align: "justify", justifyLastLine: "right",
    };
    await editor.loadLayers([layer]);
    const group = mocks.state.stage!.layers[1]?.children[0] as InstanceType<typeof mocks.Group>;
    expect(group.children.find((child) => child.hasName("editor-text-content"))?.attrs.sceneFunc).toEqual(expect.any(Function));
  });

  it("selects an unlocked layer and commits drag or transform geometry", async () => {
    const editor = createAnnotationLayer();
    const selection = vi.fn();
    const transform = vi.fn();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const layer: EditorLayer = {
      id: "rect-one", name: "Rectangle 1", order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1,
      transform: identityTransform(10, 20), width: 40, height: 30, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2, strokeStyle: "solid",
    };
    await editor.loadLayers([layer]);
    editor.setSelectionListener(selection);
    editor.setTransformListener(transform);
    editor.setMode("select");
    editor.setSnapping(false);
    editor.selectLayer(layer.id);

    const stage = mocks.state.stage!;
    const node = stage.layers[1]!.children[0]!;
    const transformer = stage.layers[2]!.children[1] as InstanceType<typeof mocks.Transformer>;
    expect(node.draggable()).toBe(true);
    expect(transformer.selected).toEqual([node]);
    stage.emitFrom("dragstart", node);
    node.attrs.x = 44;
    node.attrs.y = 55;
    stage.emitFrom("dragend", node);
    expect(transform).toHaveBeenCalledWith([layer], [expect.objectContaining({ transform: expect.objectContaining({ x: 44, y: 55 }) })]);

    stage.emitFrom("pointerdown", node);
    expect(selection).toHaveBeenCalledWith([layer.id]);
  });

  it("does not attach the transformer to hidden or locked layers", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const layer: EditorLayer = {
      id: "locked", name: "Locked", order: 0, kind: "rectangle", visible: true, locked: true, opacity: 1,
      transform: identityTransform(), width: 20, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 2, strokeStyle: "solid",
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

  it("selects and drags multiple layers as one undoable transform", async () => {
    const editor = createAnnotationLayer();
    const transform = vi.fn();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const first: EditorLayer = { id: "first", name: "First", order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1, transform: identityTransform(10, 20), width: 20, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 1, strokeStyle: "solid" };
    const second: EditorLayer = { ...first, id: "second", name: "Second", order: 1, transform: identityTransform(40, 50) };
    await editor.loadLayers([first, second]);
    editor.setTransformListener(transform);
    editor.setMode("select");
    editor.setSnapping(false);
    editor.selectLayers([first.id, second.id]);
    const stage = mocks.state.stage!;
    const firstNode = stage.layers[1]!.children[0]!;
    const secondNode = stage.layers[1]!.children[1]!;
    expect((stage.layers[2]!.children[1] as InstanceType<typeof mocks.Transformer>).selected).toEqual([firstNode, secondNode]);
    stage.emitFrom("dragstart", firstNode);
    firstNode.attrs.x = 15;
    firstNode.attrs.y = 27;
    stage.emitFrom("dragmove", firstNode);
    expect(secondNode.attrs).toMatchObject({ x: 45, y: 57 });
    stage.emitFrom("dragend", firstNode);
    expect(transform).toHaveBeenCalledWith([first, second], [expect.objectContaining({ transform: expect.objectContaining({ x: 15, y: 27 }) }), expect.objectContaining({ transform: expect.objectContaining({ x: 45, y: 57 }) })]);
  });

  it("toggles additive canvas selection and renders a group as one transformable layer", async () => {
    const editor = createAnnotationLayer();
    const selection = vi.fn();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const first: EditorLayer = { id: "first", name: "First", order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1, transform: identityTransform(10, 20), width: 20, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 1, strokeStyle: "solid" };
    const second: EditorLayer = { ...first, id: "second", name: "Second", order: 1, transform: identityTransform(40, 50) };
    await editor.loadLayers([first, second]);
    editor.setSelectionListener(selection);
    editor.setMode("select");
    editor.selectLayer(first.id);
    const stage = mocks.state.stage!;
    stage.emitFrom("pointerdown", stage.layers[1]!.children[1]!, { ctrlKey: true });
    expect(selection).toHaveBeenLastCalledWith(["first", "second"]);
    stage.emitFrom("pointerdown", stage.layers[1]!.children[0]!, { metaKey: true });
    expect(selection).toHaveBeenLastCalledWith(["second"]);
    stage.emit("pointerdown");
    expect(selection).toHaveBeenLastCalledWith([]);

    const group: EditorLayer = { id: "group", name: "Group", order: 0, kind: "group", visible: true, locked: false, opacity: 1, transform: identityTransform(), children: [first, second] };
    await editor.replaceLayers([group]);
    editor.selectLayer(group.id);
    const groupNode = stage.layers[1]!.children[0] as InstanceType<typeof mocks.Group>;
    const transformer = stage.layers[2]!.children[1] as InstanceType<typeof mocks.Transformer>;
    expect(groupNode.children).toHaveLength(2);
    expect(transformer.selected).toEqual([groupNode]);
    expect(transformer.preserveRatio).toBe(true);
  });

  it("snaps dragging to canvas geometry, draws guides, and allows Alt bypass", async () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const layer: EditorLayer = { id: "snap", name: "Snap", order: 0, kind: "rectangle", visible: true, locked: false, opacity: 1, transform: identityTransform(12, 12), width: 20, height: 10, cornerRadius: 0, fill: null, stroke: "#fff", strokeWidth: 1, strokeStyle: "solid" };
    await editor.loadLayers([layer]);
    editor.setMode("select");
    editor.selectLayer(layer.id);
    const stage = mocks.state.stage!;
    const node = stage.layers[1]!.children[0]!;
    stage.emitFrom("dragstart", node);
    node.attrs.x = 3;
    node.attrs.y = 2;
    stage.emitFrom("dragmove", node);
    expect(node.attrs).toMatchObject({ x: 0, y: 0 });
    expect(stage.layers[2]!.children.filter((child) => !child.destroyed && child.name() === "editor-snap-guide")).toHaveLength(2);
    stage.emitFrom("dragend", node);
    expect(stage.layers[2]!.children.filter((child) => !child.destroyed && child.name() === "editor-snap-guide")).toHaveLength(0);

    stage.emitFrom("dragstart", node);
    node.attrs.x = 3;
    node.attrs.y = 2;
    stage.emitFrom("dragmove", node, { altKey: true });
    expect(node.attrs).toMatchObject({ x: 3, y: 2 });
  });
});
