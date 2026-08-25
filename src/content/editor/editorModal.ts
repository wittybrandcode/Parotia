/**
 * Image editor modal. Injects a full-screen iframe into the existing overlay
 * shadow root so it stays isolated from page CSS. The iframe loads the
 * extension's editor page (ui/editor.html) which handles canvas editing.
 */

export interface EditorModal {
  show(imageKey: string, filename: string, editorToken: string): void;
  hide(): void;
  destroy(): void;
}

export function createEditorModal(shadow: ShadowRoot): EditorModal {
  const extensionOrigin = new URL(chrome.runtime.getURL("")).origin;

  // Container — full-screen fixed overlay on top of everything
  const container = document.createElement("div");
  container.setAttribute("data-parotia-editor", "true");
  Object.assign(container.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "none",
    background: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(4px)",
  });

  const frame = document.createElement("iframe");
  frame.setAttribute("data-parotia-editor-frame", "true");
  // The editor is cross-origin to the host page. Local Font Access is governed
  // by Permissions Policy, so Chrome will reject queryLocalFonts() unless the
  // embedding frame explicitly delegates the feature to the extension page.
  frame.setAttribute("allow", "local-fonts");
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.border = "none";
  frame.style.background = "#0a0a0a";
  container.appendChild(frame);

  // Listen for EDITOR_CLOSE from the iframe
  const onMessage = (event: MessageEvent<Record<string, unknown>>): void => {
    if (event.source !== frame.contentWindow) return;
    if (event.origin !== extensionOrigin) return;
    if (event.data?.source !== "parotia-editor") return;

    if (event.data.type === "EDITOR_CLOSE") {
      hide();
    }
  };
  window.addEventListener("message", onMessage);

  function show(imageKey: string, filename: string, editorToken: string): void {
    container.style.display = "flex";
    // Reset to about:blank first to force a full reload — Chrome skips the
    // React mount when only the hash changes on the same URL.
    frame.src = "about:blank";
    requestAnimationFrame(() => {
      frame.src = chrome.runtime.getURL("ui/editor.html") + `#${encodeURIComponent(JSON.stringify({
        imageKey,
        filename,
        editorToken,
        parentOrigin: window.location.origin,
      }))}`;
    });
  }

  function hide(): void {
    container.style.display = "none";
    frame.src = "about:blank";
  }

  function destroy(): void {
    window.removeEventListener("message", onMessage);
    frame.src = "about:blank";
    container.remove();
  }

  // Attach to shadow root
  shadow.appendChild(container);

  return { show, hide, destroy };
}
