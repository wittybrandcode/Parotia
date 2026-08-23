import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorModal } from "@content/editor/editorModal";

describe("editor modal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens with encoded capability data and closes only for its trusted frame", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const modal = createEditorModal(shadow);
    modal.show("editor-image:key", "capture.png", "a".repeat(48));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const container = shadow.querySelector<HTMLElement>("[data-parotia-editor]");
    const frame = shadow.querySelector<HTMLIFrameElement>("[data-parotia-editor-frame]");
    expect(container?.style.display).toBe("flex");
    expect(frame?.src).toContain("#");
    expect(frame?.src).toContain("editor-image%3Akey");

    window.dispatchEvent(new MessageEvent("message", {
      data: { source: "parotia-editor", type: "EDITOR_CLOSE" },
      source: window,
      origin: "null",
    }));
    expect(container?.style.display).toBe("flex");

    window.dispatchEvent(new MessageEvent("message", {
      data: { source: "parotia-editor", type: "EDITOR_CLOSE" },
      source: frame?.contentWindow ?? null,
      origin: "null",
    }));
    expect(container?.style.display).toBe("none");
    expect(frame?.getAttribute("src")).toBe("about:blank");
    modal.destroy();
    expect(shadow.querySelector("[data-parotia-editor]")).toBeNull();
  });

  it("hide and destroy are safe before the first show", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const modal = createEditorModal(shadow);
    modal.hide();
    modal.destroy();
    expect(shadow.childElementCount).toBe(0);
  });
});
