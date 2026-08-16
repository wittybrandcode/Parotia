import { OVERLAY_ROOT_ID, OVERLAY_ROOT_MARKER } from "@shared/constants";

/**
 * Overlay Runtime. The NewsClean UI lives inside a Shadow DOM root so that
 * website CSS cannot affect NewsClean controls and NewsClean CSS cannot leak
 * into the page. The root is a normal-flow block inserted at the top of the
 * page: it pushes the article down instead of floating over it. The root is
 * marked so inspection never selects it.
 */
export interface OverlayInstance {
  root: HTMLElement;
  shadow: ShadowRoot;
  destroy(): void;
  setVisible(visible: boolean): void;
}

export function isNewsCleanUi(target: Element | null): boolean {
  if (!target) return false;
  return target.closest(`[${OVERLAY_ROOT_MARKER}]`) !== null;
}

export function createOverlay(): OverlayInstance {
  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.setAttribute(OVERLAY_ROOT_MARKER, "true");
  // Sticky: stays in normal flow (pushes the article down) but remains pinned
  // to the top of the viewport while the page scrolls. z-index keeps page
  // content from rendering over it.
  root.style.position = "sticky";
  root.style.top = "0px";
  root.style.zIndex = "2147483646";
  root.style.display = "block";
  root.style.width = "100%";
  root.style.pointerEvents = "auto";

  const shadow = root.attachShadow({ mode: "open" });

  // The React toolbar runs in an isolated iframe (web-accessible resource),
  // which gives full DOM/script isolation and keeps the page bundle small.
  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("ui/index.html");
  frame.setAttribute("data-newsclean-frame", "true");
  frame.style.display = "block";
  frame.style.width = "100%";
  frame.style.height = "52px";
  frame.style.border = "none";
  frame.style.background = "transparent";

  shadow.appendChild(frame);

  // The iframe is cross-origin to the page, so the toolbar reports its own
  // height through postMessage. Without this the iframe would keep its default
  // 150px box and leave a dark gap below the bar that covers the article.
  const extensionOrigin = new URL(chrome.runtime.getURL("")).origin;
  const onUiResize = (event: MessageEvent<{ source?: string; type?: string; height?: number }>): void => {
    // Only accept resize reports from the toolbar iframe we host, delivered
    // straight from the extension's own origin — anything else is ignored.
    if (event.source !== frame.contentWindow) return;
    if (event.origin !== extensionOrigin) return;
    const data = event.data;
    if (data?.source !== "newsclean-ui" || data.type !== "RESIZE") return;
    const height = typeof data.height === "number" && data.height > 0 ? data.height : 0;
    frame.style.height = height > 0 ? `${height}px` : "";
  };
  window.addEventListener("message", onUiResize);

  document.body.insertBefore(root, document.body.firstChild);

  return {
    root,
    shadow,
    destroy() {
      window.removeEventListener("message", onUiResize);
      root.remove();
    },
    setVisible(visible: boolean) {
      root.style.display = visible ? "" : "none";
    },
  };
}
