import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("applies RESIZE only when the sender is the hosted toolbar iframe from the extension origin", () => {
    const frame = overlay.shadow.querySelector("iframe[data-newsclean-frame]") as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    if (!frame) return;
    const extensionOrigin = new URL(chrome.runtime.getURL("")).origin;

    const fire = (partial: MessageEventInit): void => {
      window.dispatchEvent(new MessageEvent("message", partial));
    };

    fire({
      data: { source: "newsclean-ui", type: "RESIZE", height: 320 },
      source: frame.contentWindow,
      origin: extensionOrigin,
    });
    expect(frame.style.height).toBe("320px");

    fire({
      data: { source: "newsclean-ui", type: "RESIZE", height: 100 },
      source: frame.contentWindow,
      origin: "https://evil.example",
    });
    expect(frame.style.height).toBe("320px");

    fire({
      data: { source: "newsclean-ui", type: "RESIZE", height: 100 },
      source: null,
      origin: extensionOrigin,
    });
    expect(frame.style.height).toBe("320px");
  });

  it("does not post until the toolbar proves its extension origin", () => {
    const frame = overlay.shadow.querySelector("iframe[data-newsclean-frame]") as HTMLIFrameElement | null;
    expect(frame?.contentWindow).not.toBeNull();
    if (!frame?.contentWindow) return;
    const postMessage = vi.spyOn(frame.contentWindow, "postMessage");

    expect(overlay.postToToolbar({ type: "STATE" })).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent("message", {
      data: { source: "parotia-ui", type: "RESIZE", height: 52 },
      source: frame.contentWindow,
      origin: new URL(chrome.runtime.getURL("")).origin,
    }));

    expect(overlay.postToToolbar({ type: "STATE" })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { type: "STATE" },
      new URL(chrome.runtime.getURL("")).origin,
    );
  });
});
