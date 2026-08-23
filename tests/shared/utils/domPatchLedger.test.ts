import { beforeEach, describe, expect, it } from "vitest";
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
});
