import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomPatchLedger } from "@shared/utils/domPatchLedger";

describe("DomPatchLedger", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("restores the first inline value and priority after repeated writes", () => {
    const element = document.createElement("div");
    element.style.setProperty("visibility", "collapse", "important");
    const ledger = new DomPatchLedger();

    ledger.setStyle(element, "visibility", "hidden", "important");
    ledger.setStyle(element, "visibility", "visible");
    ledger.restore();

    expect(element.style.getPropertyValue("visibility")).toBe("collapse");
    expect(element.style.getPropertyPriority("visibility")).toBe("important");
  });

  it("restores absent styles and exact attribute presence", () => {
    const image = document.createElement("img");
    image.setAttribute("src", "before.png");
    const ledger = new DomPatchLedger();

    ledger.setStyle(image, "opacity", "1", "important");
    ledger.setAttribute(image, "src", "after.png");
    ledger.setAttribute(image, "loading", "eager");
    ledger.restore();
    ledger.restore();

    expect(image.style.getPropertyValue("opacity")).toBe("");
    expect(image.getAttribute("src")).toBe("before.png");
    expect(image.hasAttribute("loading")).toBe(false);
  });

  it("restores removed attributes once and rejects every mutation after restore", () => {
    const element = document.createElement("div");
    element.setAttribute("role", "note");
    const ledger = new DomPatchLedger();
    ledger.removeAttribute(element, "role");
    ledger.removeAttribute(element, "role");
    ledger.removeAttribute(element, "missing");
    expect(element.hasAttribute("role")).toBe(false);
    ledger.restore();
    expect(element.getAttribute("role")).toBe("note");
    expect(element.hasAttribute("missing")).toBe(false);
    expect(() => ledger.setStyle(element, "display", "none")).toThrow(/restored/);
    expect(() => ledger.setAttribute(element, "role", "button")).toThrow(/restored/);
    expect(() => ledger.removeAttribute(element, "role")).toThrow(/restored/);
  });

  it("continues restoring remaining entries when one hostile undo throws", () => {
    const hostile = document.createElement("div");
    const safe = document.createElement("div");
    safe.setAttribute("data-state", "before");
    const ledger = new DomPatchLedger();
    ledger.setAttribute(safe, "data-state", "after");
    ledger.setAttribute(hostile, "data-temp", "value");
    vi.spyOn(hostile, "removeAttribute").mockImplementation(() => { throw new Error("hostile node"); });
    ledger.restore();
    expect(safe.getAttribute("data-state")).toBe("before");
  });

  it("normalizes a hostile null value for an attribute reported as present", () => {
    const element = document.createElement("div");
    element.setAttribute("data-state", "before");
    vi.spyOn(element, "hasAttribute").mockReturnValue(true);
    vi.spyOn(element, "getAttribute").mockReturnValue(null);
    const ledger = new DomPatchLedger();
    ledger.setAttribute(element, "data-state", "after");
    ledger.restore();
    expect(element.getAttribute("data-state")).toBeNull();
    expect(Element.prototype.getAttribute.call(element, "data-state")).toBe("");
  });
});
