import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorViewport } from "@ui/src/editor/EditorViewport";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("EditorViewport", () => {
  let wrapper: HTMLDivElement;
  let surface: HTMLDivElement;
  let viewportRect: DOMRect;

  beforeEach(() => {
    document.body.innerHTML = '<div id="wrapper"><div id="surface"></div></div>';
    wrapper = document.querySelector("#wrapper")!;
    surface = document.querySelector("#surface")!;
    viewportRect = rect(100, 50, 1_000, 800);
    vi.spyOn(wrapper, "getBoundingClientRect").mockImplementation(() => viewportRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("fits a native-resolution surface and keeps its center fixed while zooming", () => {
    const changes = vi.fn();
    const viewport = createEditorViewport(wrapper, surface, 2_000, 1_000, { onChange: changes });

    expect(viewport.state.mode).toBe("FIT");
    expect(viewport.state.scale).toBeCloseTo(0.484);
    expect(viewport.state.offsetX).toBeCloseTo(16);
    expect(viewport.state.offsetY).toBeCloseTo(158);
    expect(surface.style.width).toBe("2000px");
    expect(surface.style.height).toBe("1000px");
    viewport.panBy(100, 100);
    expect(viewport.state.mode).toBe("FIT");

    const anchor = { x: 500, y: 400 };
    const imagePointBefore = {
      x: (anchor.x - viewport.state.offsetX) / viewport.state.scale,
      y: (anchor.y - viewport.state.offsetY) / viewport.state.scale,
    };
    viewport.zoomBy(2, anchor);
    const imagePointAfter = {
      x: (anchor.x - viewport.state.offsetX) / viewport.state.scale,
      y: (anchor.y - viewport.state.offsetY) / viewport.state.scale,
    };

    expect(viewport.state.mode).toBe("CUSTOM");
    expect(imagePointAfter.x).toBeCloseTo(imagePointBefore.x);
    expect(imagePointAfter.y).toBeCloseTo(imagePointBefore.y);
    expect(changes).toHaveBeenCalled();
  });

  it("supports actual pixels, bounded panning, fit refresh, and scale limits", () => {
    const viewport = createEditorViewport(wrapper, surface, 2_000, 1_000);
    viewport.actualSize();
    expect(viewport.state).toMatchObject({ scale: 1, percent: 100, mode: "ACTUAL" });

    viewport.panBy(100_000, 100_000);
    expect(viewport.state.offsetX).toBe(952);
    expect(viewport.state.offsetY).toBe(752);
    viewport.setScale(100);
    expect(viewport.state.scale).toBe(8);
    viewport.setScale(0.0001);
    expect(viewport.state.scale).toBe(0.05);

    viewportRect = rect(100, 50, 500, 300);
    viewport.fit();
    expect(viewport.state.scale).toBeCloseTo(0.234);
    viewportRect = rect(100, 50, 1_000, 800);
    viewport.refresh();
    expect(viewport.state.scale).toBeCloseTo(0.484);
    viewport.destroy();
  });

  it("zooms at the cursor, pans with the wheel, and removes listeners on destroy", () => {
    const viewport = createEditorViewport(wrapper, surface, 2_000, 1_000);
    const initialScale = viewport.state.scale;
    const zoomEvent = new WheelEvent("wheel", { clientX: 600, clientY: 450, deltaY: -100, ctrlKey: true, cancelable: true });
    Object.defineProperties(zoomEvent, {
      ctrlKey: { value: true }, clientX: { value: 600 }, clientY: { value: 450 }, deltaY: { value: -100 },
    });
    wrapper.dispatchEvent(zoomEvent);
    expect(zoomEvent.defaultPrevented).toBe(true);
    expect(viewport.state.scale).toBeGreaterThan(initialScale);

    const beforePan = viewport.state.offsetX;
    const panEvent = new WheelEvent("wheel", { deltaX: 40, deltaY: 0, cancelable: true });
    Object.defineProperties(panEvent, { deltaX: { value: 40 }, deltaY: { value: 0 } });
    wrapper.dispatchEvent(panEvent);
    expect(viewport.state.offsetX).toBeLessThan(beforePan);

    const beforeDestroy = viewport.state;
    viewport.destroy();
    expect(surface.style.transform).toBe("");
    wrapper.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true }));
    expect(viewport.state).toEqual(beforeDestroy);
  });

  it("can suspend viewport gestures while a coordinate-sensitive tool is active", () => {
    const viewport = createEditorViewport(wrapper, surface, 2_000, 1_000);
    viewport.setGesturesEnabled(false);
    const previous = viewport.state;
    const wheel = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true });
    wrapper.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(viewport.state).toEqual(previous);

    viewport.setGesturesEnabled(true);
    const enabledWheel = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true });
    Object.defineProperties(enabledWheel, { ctrlKey: { value: true }, deltaY: { value: -100 } });
    wrapper.dispatchEvent(enabledWheel);
    expect(viewport.state.scale).toBeGreaterThan(previous.scale);
    viewport.destroy();
  });

  it("pans with Space plus drag and exposes a grabbing cursor", () => {
    const viewport = createEditorViewport(wrapper, surface, 2_000, 1_000);
    viewport.actualSize();
    const initialX = viewport.state.offsetX;
    const spaceDown = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
    window.dispatchEvent(spaceDown);
    expect(wrapper).toHaveClass("nc-editor-viewport-pan-ready");

    const drawingListener = vi.fn();
    surface.addEventListener("pointerdown", drawingListener);
    const pointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(pointerDown, {
      button: { value: 0 }, pointerId: { value: 7 }, clientX: { value: 200 }, clientY: { value: 200 },
    });
    surface.dispatchEvent(pointerDown);
    expect(wrapper).toHaveClass("nc-editor-viewport-panning");
    expect(drawingListener).not.toHaveBeenCalled();

    const pointerMove = new Event("pointermove", { bubbles: true });
    Object.defineProperties(pointerMove, {
      pointerId: { value: 7 }, clientX: { value: 250 }, clientY: { value: 200 },
    });
    wrapper.dispatchEvent(pointerMove);
    expect(viewport.state.offsetX).toBe(initialX + 50);

    const pointerUp = new Event("pointerup", { bubbles: true });
    Object.defineProperty(pointerUp, "pointerId", { value: 7 });
    wrapper.dispatchEvent(pointerUp);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
    expect(wrapper).not.toHaveClass("nc-editor-viewport-panning");
    viewport.destroy();
  });
});
