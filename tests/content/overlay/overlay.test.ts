import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOverlay } from "@content/overlay/overlay";

describe("createOverlay", () => {
  let overlay: ReturnType<typeof createOverlay>;

  beforeEach(() => {
    overlay = createOverlay();
  });

  afterEach(() => {
    overlay.destroy();
  });

  it("renders the toolbar iframe inside a shadow root", () => {
    expect(overlay.root.id).toBe("__newsclean__");
    const frame = overlay.shadow.querySelector("iframe[data-newsclean-frame]") as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    // The frame src comes from chrome.runtime.getURL (stubbed in tests/setup.ts).
    expect(frame?.getAttribute("src")).toBeTruthy();
  });

  it("setVisible(false) hides the root and setVisible(true) restores it", () => {
    overlay.setVisible(false);
    expect(overlay.root.style.display).toBe("none");
    overlay.setVisible(true);
    expect(overlay.root.style.display).toBe("");
  });

  it("destroy removes the root from the DOM", () => {
    overlay.destroy();
    expect(document.getElementById("__newsclean__")).toBeNull();
  });
});
