import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixedHeaderManager } from "@content/capture/fixedHeaders";

function baseRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockRect(el: HTMLElement, partial: Partial<DOMRect>): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ ...baseRect(), ...partial } as DOMRect);
}

const TOP_HEADER_RECT = { top: 0, bottom: 60, width: 1280, height: 60 };

describe("FixedHeaderManager", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("detects a fixed header in the top strip of the viewport", () => {
    const header = document.createElement("header");
    header.style.position = "fixed";
    document.body.appendChild(header);
    mockRect(header, TOP_HEADER_RECT);

    const manager = new FixedHeaderManager();
    expect(manager.detect()).toBe(1);
  });

  it("ignores fixed elements below the top strip", () => {
    const below = document.createElement("div");
    below.style.position = "fixed";
    document.body.appendChild(below);
    mockRect(below, { top: 300, bottom: 360, width: 200, height: 60 });

    const manager = new FixedHeaderManager();
    expect(manager.detect()).toBe(0);
  });

  it("ignores tall fixed elements such as sidebars", () => {
    const sidebar = document.createElement("aside");
    sidebar.style.position = "fixed";
    document.body.appendChild(sidebar);
    mockRect(sidebar, { top: 0, bottom: 800, width: 300, height: 800 });

    const manager = new FixedHeaderManager();
    expect(manager.detect()).toBe(0);
  });

  it("detects sticky elements that stick near the top", () => {
    const nav = document.createElement("nav");
    nav.style.position = "sticky";
    nav.style.top = "0px";
    document.body.appendChild(nav);

    const manager = new FixedHeaderManager();
    expect(manager.detect()).toBe(1);
  });

  it("ignores sticky elements that stick far from the top", () => {
    const nav = document.createElement("nav");
    nav.style.position = "sticky";
    nav.style.top = "200px";
    document.body.appendChild(nav);

    const manager = new FixedHeaderManager();
    expect(manager.detect()).toBe(0);
  });

  it("keeps only the outermost fixed element", () => {
    const outer = document.createElement("div");
    outer.style.position = "fixed";
    const inner = document.createElement("div");
    inner.style.position = "fixed";
    outer.appendChild(inner);
    document.body.appendChild(outer);
    mockRect(outer, TOP_HEADER_RECT);
    mockRect(inner, TOP_HEADER_RECT);

    const manager = new FixedHeaderManager();
    expect(manager.detect()).toBe(1);
  });

  it("ignores the NewsClean overlay root", () => {
    const overlay = document.createElement("div");
    overlay.id = "__newsclean__";
    overlay.setAttribute("data-newsclean-root", "true");
    overlay.style.position = "fixed";
    document.body.appendChild(overlay);
    mockRect(overlay, { top: 0, bottom: 100, width: 1280, height: 100 });

    const manager = new FixedHeaderManager();
    expect(manager.detect()).toBe(0);
  });

  it("hides headers and restores their original inline visibility", () => {
    const header = document.createElement("header");
    header.style.position = "fixed";
    header.style.visibility = "visible";
    document.body.appendChild(header);
    mockRect(header, TOP_HEADER_RECT);

    const manager = new FixedHeaderManager();
    manager.detect();

    manager.hideAll();
    expect(header.style.getPropertyValue("visibility")).toBe("hidden");
    expect(header.style.getPropertyPriority("visibility")).toBe("important");

    manager.hideAll();
    expect(header.style.getPropertyValue("visibility")).toBe("hidden");

    manager.restoreAll();
    expect(header.style.getPropertyValue("visibility")).toBe("visible");
  });

  it("removes the visibility property when the header had none before", () => {
    const header = document.createElement("header");
    header.style.position = "fixed";
    document.body.appendChild(header);
    mockRect(header, TOP_HEADER_RECT);

    const manager = new FixedHeaderManager();
    manager.detect();

    manager.hideAll();
    expect(header.style.getPropertyValue("visibility")).toBe("hidden");

    manager.restoreAll();
    expect(header.style.getPropertyValue("visibility")).toBe("");
  });

  it("can be reused after reset", () => {
    const manager = new FixedHeaderManager();
    const header = document.createElement("header");
    header.style.position = "fixed";
    document.body.appendChild(header);
    mockRect(header, TOP_HEADER_RECT);

    expect(manager.detect()).toBe(1);
    manager.hideAll();
    manager.reset();
    expect(header.style.getPropertyValue("visibility")).toBe("");

    header.remove();
    expect(manager.detect()).toBe(0);
  });
});
