import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class Shape {
    attrs: Record<string, unknown>;
    layer: Layer | null = null;
    destroyed = false;
    constructor(attrs: Record<string, unknown> = {}) { this.attrs = { ...attrs }; }
    remove() { this.layer = null; }
    destroy() { this.destroyed = true; }
    getLayer() { return this.layer; }
    id(value: string) { this.attrs.id = value; }
    name(value: string) { this.attrs.name = value; }
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
    visible(value?: boolean) { if (value !== undefined) this.attrs.visible = value; return Boolean(this.attrs.visible); }
  }
  class Layer {
    children: Shape[] = [];
    add(shape: Shape) { shape.layer = this; this.children.push(shape); }
    batchDraw = vi.fn();
  }
  class Group extends Shape {
    children: Shape[] = [];
    add(...shapes: Shape[]) { this.children.push(...shapes); }
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
    add(...layers: Layer[]) { this.layers.push(...layers); }
    on(events: string, handler: (event: { target: unknown }) => void) {
      for (const event of events.split(" ")) this.handlers.set(event, handler);
    }
    emit(event: string) { this.handlers.get(event)?.({ target: this }); }
    emitFrom(event: string, target: unknown) { this.handlers.get(event)?.({ target }); }
    getPointerPosition() { return this.pointer; }
    container() { return this.config.container; }
    width() { return this.config.width; }
    toCanvas() { return document.createElement("canvas"); }
    draw = vi.fn();
    destroy() { this.destroyed = true; }
  }
  const state: { stage: Stage | null } = { stage: null };
  return { state, Stage, Layer, Line, Rect, Ellipse, Circle, Group, Shape };
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
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ kind: expectedKind, visible: true, locked: false, opacity: 1 });
    expect(stage.layers[1]?.children[0]?.attrs.id).toMatch(/^editor-layer-/);
  });

  it("discards a zero-size gesture and commits text once on Enter plus blur", () => {
    const editor = createAnnotationLayer();
    const listener = vi.fn();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    editor.setCommitListener(listener);
    const stage = mocks.state.stage!;
    stage.emit("pointerdown");
    stage.emit("pointerup");
    expect(listener).not.toHaveBeenCalled();

    editor.setTool("text");
    stage.emit("pointerdown");
    const input = document.body.querySelector("input")!;
    input.value = "caption";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    input.dispatchEvent(new Event("blur"));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("cancels pending text, exports without the cursor, and destroys idempotently", () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    editor.setOptions({ color: "#fff", strokeWidth: 8, fontSize: 32 });
    editor.setTool("text");
    mocks.state.stage!.emit("pointerdown");
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

  it("ignores events from existing shapes and a second text click while input is pending", () => {
    const editor = createAnnotationLayer();
    editor.init(document.querySelector("#stage")!, 200, 100, new Image());
    const stage = mocks.state.stage!;
    stage.emitFrom("pointerdown", {});
    expect(stage.layers[1]?.children).toHaveLength(0);
    editor.setTool("text");
    stage.emit("pointerdown");
    stage.emit("pointerdown");
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
});
