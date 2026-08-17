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
): void {
  target.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }),
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
});
