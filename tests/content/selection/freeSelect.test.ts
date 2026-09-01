import { afterEach, describe, expect, it } from "vitest";
import { startFreeSelect } from "@content/selection/freeSelect";

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
}

function fireMouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  x: number,
  y: number,
  button = 0,
): void {
  target.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true }),
  );
}

function clickEl(target: Element): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function getDim(): Element | null {
  return document.querySelector("[data-newsclean-freeselect]");
}

function getBar(): Element | null {
  return document.querySelector("[data-newsclean-freeselect-bar]");
}

function getCaptureBtn(): Element | null {
  return document.querySelector("[data-newsclean-freeselect-capture]");
}

function getCancelBtn(): Element | null {
  return document.querySelector("[data-newsclean-freeselect-cancel]");
}

function getRect(): HTMLElement {
  const rect = document.querySelector<HTMLElement>("[data-newsclean-freeselect-rect]");
  if (!rect) throw new Error("selection rectangle is missing");
  return rect;
}

function getHandle(position: string): HTMLElement {
  const handle = document.querySelector<HTMLElement>(`[data-newsclean-freeselect-handle="${position}"]`);
  if (!handle) throw new Error(`handle ${position} is missing`);
  return handle;
}

function draw(x1 = 100, y1 = 100, x2 = 200, y2 = 180): void {
  const dim = getDim();
  if (!dim) throw new Error("selection overlay is missing");
  fireMouse(dim, "mousedown", x1, y1);
  fireMouse(window, "mousemove", x2, y2);
  fireMouse(window, "mouseup", x2, y2);
}

describe("freeSelect", () => {
  afterEach(() => {
    document.querySelectorAll("[data-newsclean-freeselect]").forEach((el) => el.remove());
    document.querySelectorAll("[data-newsclean-freeselect-rect]").forEach((el) => el.remove());
    document.querySelectorAll("[data-newsclean-freeselect-handle]").forEach((el) => el.remove());
    document.querySelectorAll("[data-newsclean-freeselect-bar]").forEach((el) => el.remove());
    document.querySelectorAll("[data-newsclean-freeselect-label]").forEach((el) => el.remove());
  });

  it("creates a dimming overlay on activation", () => {
    void startFreeSelect();
    expect(getDim()).not.toBeNull();
  });

  it("resolves null when Escape is pressed before drawing", async () => {
    const promise = startFreeSelect();
    fireKey("Escape");
    const result = await promise;
    expect(result).toBeNull();
  });

  it("removes the overlay after Escape", async () => {
    const promise = startFreeSelect();
    fireKey("Escape");
    await promise;
    expect(getDim()).toBeNull();
    expect(document.querySelector("[data-newsclean-freeselect-rect]")).toBeNull();
  });

  it("stays pending when the drawn rect is too small (< 8px)", () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 100, 100);
    fireMouse(window, "mousemove", 103, 103);
    fireMouse(window, "mouseup", 103, 103);
    // Promise should still be pending — no resolve, no bar shown.
    let resolved = false;
    promise.then(() => { resolved = true; });
    // Give microtasks a chance to settle.
    return new Promise<void>((r) => setTimeout(r, 20)).then(() => {
      expect(resolved).toBe(false);
    });
  });

  it("shows the capture bar and handles after drawing a valid rect", () => {
    void startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 100, 100);
    fireMouse(window, "mousemove", 300, 250);
    fireMouse(window, "mouseup", 300, 250);
    const handles = document.querySelectorAll("[data-newsclean-freeselect-handle]");
    expect(handles).toHaveLength(8);
    expect(getBar()).not.toBeNull();
    expect(getCaptureBtn()).not.toBeNull();
    expect(getCancelBtn()).not.toBeNull();
  });

  it("resolves with a valid rect when Capture is clicked", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 100, 100);
    fireMouse(window, "mousemove", 300, 250);
    fireMouse(window, "mouseup", 300, 250);
    clickEl(getCaptureBtn()!);
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.rect.x).toBe(100);
    expect(result!.rect.y).toBe(100);
    expect(result!.rect.width).toBe(200);
    expect(result!.rect.height).toBe(150);
    expect(result!.dpr).toBeGreaterThan(0);
  });

  it("resolves null when Cancel is clicked", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 100, 100);
    fireMouse(window, "mousemove", 300, 250);
    fireMouse(window, "mouseup", 300, 250);
    clickEl(getCancelBtn()!);
    const result = await promise;
    expect(result).toBeNull();
  });

  it("resolves null when Escape is pressed during adjust phase", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 100, 100);
    fireMouse(window, "mousemove", 300, 250);
    fireMouse(window, "mouseup", 300, 250);
    fireKey("Escape");
    const result = await promise;
    expect(result).toBeNull();
  });

  it("normalises a rect drawn in reverse direction (negative dimensions)", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 300, 250);
    fireMouse(window, "mousemove", 100, 100);
    fireMouse(window, "mouseup", 100, 100);
    clickEl(getCaptureBtn()!);
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.rect.x).toBe(100);
    expect(result!.rect.y).toBe(100);
    expect(result!.rect.width).toBe(200);
    expect(result!.rect.height).toBe(150);
  });

  it("cleanly removes all DOM elements after Capture", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 10, 10);
    fireMouse(window, "mousemove", 200, 200);
    fireMouse(window, "mouseup", 200, 200);
    clickEl(getCaptureBtn()!);
    await promise;
    expect(getDim()).toBeNull();
    expect(document.querySelector("[data-newsclean-freeselect-rect]")).toBeNull();
    expect(document.querySelectorAll("[data-newsclean-freeselect-handle]")).toHaveLength(0);
    expect(getBar()).toBeNull();
  });

  it("shows a dimension label during adjust phase", () => {
    void startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 50, 50);
    fireMouse(window, "mousemove", 250, 150);
    fireMouse(window, "mouseup", 250, 150);
    const lbl = document.querySelector("[data-newsclean-freeselect-label]");
    expect(lbl).not.toBeNull();
    expect(lbl!.textContent).toBe("200 x 100");
  });

  it("ignores non-primary drawing clicks and clicks behind an adjusted selection", () => {
    void startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 20, 20, 2);
    expect(getRect().style.display).toBe("none");

    fireMouse(getRect(), "mousedown", 20, 20);
    fireMouse(getHandle("e"), "mousedown", 20, 20);
    clickEl(getCaptureBtn()!);

    draw();
    fireMouse(dim, "mousedown", 20, 20);
    fireMouse(getRect(), "mousedown", 150, 140, 2);
    expect(getRect().style.left).toBe("100px");
    fireKey("Escape");
  });

  it("moves a completed selection while clamping it to viewport bounds", async () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 300 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 200 });
    try {
      const promise = startFreeSelect();
      draw(100, 80, 200, 160);
      fireMouse(getRect(), "mousedown", 150, 120);
      fireMouse(window, "mousemove", -500, -500);
      fireMouse(window, "mouseup", -500, -500);
      expect(getRect().style.left).toBe("0px");
      expect(getRect().style.top).toBe("0px");

      fireMouse(getRect(), "mousedown", 50, 40);
      fireMouse(window, "mousemove", 1000, 1000);
      fireMouse(window, "mouseup", 1000, 1000);
      clickEl(getCaptureBtn()!);
      await expect(promise).resolves.toEqual(expect.objectContaining({
        rect: { x: 200, y: 120, width: 100, height: 80 },
      }));
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("resizes from both opposing corners and normalises a crossed resize", async () => {
    const promise = startFreeSelect();
    draw(100, 100, 200, 180);

    fireMouse(getHandle("se"), "mousedown", 200, 180);
    fireMouse(window, "mousemove", 250, 240);
    fireMouse(window, "mouseup", 250, 240);
    expect(getRect().style.width).toBe("150px");
    expect(getRect().style.height).toBe("140px");

    fireMouse(getHandle("nw"), "mousedown", 100, 100);
    fireMouse(window, "mousemove", 300, 300);
    fireMouse(window, "mouseup", 300, 300);
    clickEl(getCaptureBtn()!);
    await expect(promise).resolves.toEqual(expect.objectContaining({
      rect: { x: 250, y: 240, width: 50, height: 60 },
    }));
  });

  it("does not confirm a resized region below the minimum size", async () => {
    const promise = startFreeSelect();
    draw(100, 100, 200, 180);
    fireMouse(getHandle("se"), "mousedown", 200, 180);
    fireMouse(window, "mousemove", 105, 105);
    fireMouse(window, "mouseup", 105, 105);
    clickEl(getCaptureBtn()!);

    let settled = false;
    void promise.then(() => { settled = true; });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    fireKey("Escape");
    await expect(promise).resolves.toBeNull();
  });

  it("keeps the toolbar inside the viewport above a low selection", () => {
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 120 });
    try {
      void startFreeSelect();
      draw(10, 0, 110, 100);
      const bar = getBar() as HTMLElement;
      expect(bar.style.display).toBe("flex");
      expect(Number.parseFloat(bar.style.top)).toBeGreaterThanOrEqual(0);
    } finally {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
      fireKey("Escape");
    }
  });

  it("uses DPR fallback and cancels a live gesture when pointer ownership is lost", async () => {
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 0 });
    try {
      const capture = startFreeSelect();
      draw();
      clickEl(getCaptureBtn()!);
      await expect(capture).resolves.toEqual(expect.objectContaining({ dpr: 1 }));

      const cancelled = startFreeSelect();
      window.dispatchEvent(new Event("pointercancel"));
      const dim = getDim()!;
      fireMouse(dim, "mousedown", 10, 10);
      window.dispatchEvent(new Event("pointercancel"));
      await expect(cancelled).resolves.toBeNull();
      expect(getDim()).toBeNull();
    } finally {
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: originalDpr });
    }
  });

  it("does not enter resize mode for a non-primary or malformed handle", () => {
    void startFreeSelect();
    draw();
    const handle = getHandle("e");
    fireMouse(handle, "mousedown", 200, 140, 2);
    fireMouse(window, "mousemove", 260, 140);
    expect(getRect().style.width).toBe("100px");

    handle.removeAttribute("data-newsclean-freeselect-handle");
    fireMouse(handle, "mousedown", 200, 140);
    fireMouse(window, "mousemove", 260, 140);
    expect(getRect().style.width).toBe("100px");
    fireKey("Escape");
  });
});
