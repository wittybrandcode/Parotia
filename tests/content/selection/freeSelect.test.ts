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

function getDim(): Element | null {
  return document.querySelector("[data-newsclean-freeselect]");
}

describe("freeSelect", () => {
  afterEach(() => {
    document.querySelectorAll("[data-newsclean-freeselect]").forEach((el) => el.remove());
    document.querySelectorAll("[data-newsclean-freeselect-rect]").forEach((el) => el.remove());
    document.querySelectorAll("[data-newsclean-freeselect-handle]").forEach((el) => el.remove());
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

  it("resolves null when the drawn rect is too small (< 8px)", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 100, 100);
    fireMouse(window, "mousemove", 103, 103);
    fireMouse(window, "mouseup", 103, 103);
    const result = await promise;
    expect(result).toBeNull();
  });

  it("resolves with a valid rect when drawn large enough", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 100, 100);
    fireMouse(window, "mousemove", 300, 250);
    fireMouse(window, "mouseup", 300, 250);
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.rect.x).toBe(100);
    expect(result!.rect.y).toBe(100);
    expect(result!.rect.width).toBe(200);
    expect(result!.rect.height).toBe(150);
    expect(result!.dpr).toBeGreaterThan(0);
  });

  it("normalises a rect drawn in reverse direction (negative dimensions)", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 300, 250);
    fireMouse(window, "mousemove", 100, 100);
    fireMouse(window, "mouseup", 100, 100);
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result!.rect.x).toBe(100);
    expect(result!.rect.y).toBe(100);
    expect(result!.rect.width).toBe(200);
    expect(result!.rect.height).toBe(150);
  });

  it("shows 8 resize handles while dragging", () => {
    void startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 50, 50);
    fireMouse(window, "mousemove", 200, 200);
    const handles = document.querySelectorAll("[data-newsclean-freeselect-handle]");
    expect(handles).toHaveLength(8);
    handles.forEach((h) => expect((h as HTMLElement).style.display).toBe("block"));
  });

  it("cleanly removes all DOM elements after completion", async () => {
    const promise = startFreeSelect();
    const dim = getDim()!;
    fireMouse(dim, "mousedown", 10, 10);
    fireMouse(window, "mousemove", 200, 200);
    fireMouse(window, "mouseup", 200, 200);
    await promise;
    expect(getDim()).toBeNull();
    expect(document.querySelector("[data-newsclean-freeselect-rect]")).toBeNull();
    expect(document.querySelectorAll("[data-newsclean-freeselect-handle]")).toHaveLength(0);
  });
});
