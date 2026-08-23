import { LEGACY_UI_MESSAGE_SOURCE, OVERLAY_ROOT_ID, OVERLAY_ROOT_MARKER, UI_MESSAGE_SOURCE } from "@shared/constants";

const SPLASH_SPINS = 3;
const SPLASH_SPIN_SEC = SPLASH_SPINS * 1.15;

const SPLASH_SVG = `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;fill:currentColor" aria-hidden="true"><path d="M1269.5,218.4c-8.4-4.3-16.5-9-25.1-13c-36.1-16.7-74.4-24.2-114-24.3c-67.3-0.1-129.2,18.1-185,56.1c-18.5,12.6-35.8,26.6-50.8,43.5c0.8-0.4,1.7-0.8,2.5-1.3c62.1-43.1,130.9-63.6,206.4-59.8c71.2,3.6,134.5,28.9,189.4,74.2c58.4,48.1,94.1,110.4,112.1,183.4c6.1,24.8,9.3,50.1,9.1,75.7c0,2.2,0,4.3-0.6,6.5c-1.4-9.5-2.5-19.1-4.3-28.6c-16.3-83.3-61-147.6-131.9-193.3c-70.8-45.7-148.4-58.1-230.9-43.9c-49.7,8.6-94,29.8-136.1,56.5c-28.3,18-53.8,39.3-74.9,65.5c-8.7,10.8-16,22.8-24,34.2c0.4,0.3,0.8,0.7,1.2,1c7.8-2.2,15.4-5,23.3-6.4c62.6-11.2,114.7,7,154.2,57.3c18,22.9,28.3,49.4,28.9,78.9c1.1,54-32.8,98.1-86.5,112.3c-38,10-73.9,3-107.4-16.2c-43.4-24.8-70.9-62.9-87.1-109.4c-18.3-52.5-18.9-105.9-4.7-159.4c21.4-80.4,67.1-144.2,134.3-192.8c43-31,90.3-52.4,142.6-62.3c72.2-13.7,141.6-5.8,207.3,28.4c17.3,9,33.6,19.8,48.4,32.6c1.4,1.2,2.7,2.5,4,3.7C1269.9,217.8,1269.7,218.1,1269.5,218.4z"/><path d="M943.7,342.3c5.1-2.7,10.1-5.6,15.3-8.2c29-14.4,58.4-27.6,90.6-33.3c26.3-4.6,52.5-3.5,78.5,1.8c56.2,11.4,104.1,38.4,144.9,78.1c59.1,57.6,93.3,128.2,105.1,209.6c12.4,85.5-4.3,165.7-48.2,240.1c-6.2,10.5-13.6,20.4-21,30.2c35.7-70,50.9-143.5,37.4-221.5c-13.3-77.3-47.2-144.1-104.2-198.4c-0.4,0.2-0.8,0.4-1.2,0.6c1.4,2,2.7,4,4.1,6c1.5,2.2,2.9,4.5,4.4,6.7c24.8,36.9,40.9,77.4,49.5,120.8c14.9,74.6,7.4,147.2-19.7,218c-19.7,51.4-48.3,97.2-88.1,135.6c-41,39.5-88.7,67.2-144.4,80.4c-1.5,0.4-3.1,0.5-4.8,0.1c8.4-3.6,16.8-6.9,25-10.8c44.9-21.2,81.2-52.9,109.9-92.9c59.8-83.5,80.5-176.8,67-278.1c-6.6-49.1-20.9-96-43.7-140c-27.6-53.4-67.2-95.5-120.7-123.5c-36.9-19.3-76.3-28.6-118.2-23.3c-5.7,0.7-11.3,1.8-17,2.8C943.9,342.8,943.8,342.5,943.7,342.3z"/><path d="M714.9,586.5c-9-11.7-18.7-22.9-26.9-35.1c-41.7-62.4-58.4-131-47.7-205.5c8.8-60.7,34.5-113.8,75.2-159.6c53.5-60.2,121.1-95.2,199.7-110.1c22.8-4.3,45.9-5.9,69.2-5.2c1.6,0.1,3.3,0.2,5,1.1c-2,0.2-4,0.5-6.1,0.6c-74.1,5.7-138.4,34.2-193.7,83.5c-57.3,51.2-94.4,114.5-112.1,189.1c-14.8,62.6-10.1,124.2,12.8,184.1c6.7,17.5,15.6,34.2,23.6,51.2c0.7,1.6,1.6,3.1,2.3,4.7C715.8,585.8,715.4,586.2,714.9,586.5z"/><path d="M1185,629.9c-0.7,18.4-0.7,36.8-2.4,55.1c-3,32.1-10.4,63.3-22.2,93.4c-18.6,47.4-45.7,89-83.5,123.4c-40.4,36.8-86.9,62.1-140.3,73.7c-78.5,17-152.2,3.8-220.8-37.7c-8.6-5.2-16.5-11.6-24.1-18.4c7.6,3.9,15.1,8,22.9,11.7c62.1,29,126.5,33.9,192.6,17.6c72.8-18,133-56.8,182-113.2c43.1-49.7,73-106.3,87.4-170.7c2.3-10.2,3.8-20.6,5.7-30.9c0.3-1.4,0.7-2.8,1-4.2C1183.8,629.8,1184.4,629.9,1185,629.9z"/><path d="M837.2,747.1c-81,3.1-151.8-19.8-210.9-74.5C574,624.3,543.5,564.2,534,493.9c-10.3-76.6,7-147.9,45.3-214.4c5.5-9.6,12-18.5,18.6-27.5c-55.7,101.6-62.1,205.7-10.6,309.8C638.2,664.8,720.3,729.2,837.2,747.1z"/><path d="M505.8,592.8c26.1,110.3,91,187.7,196.3,229.3c105.1,41.5,205.3,27.5,301.6-32.5c-1.6,2-2.2,2.9-3.1,3.8c-39.1,39.2-86.1,64.2-140,75.7c-90.4,19.3-170.8-2.8-241.3-61.5c-46-38.4-76.9-87.5-97.2-143.5c-7.7-21.2-13-43-15.8-65.4C506.1,596.7,506,594.7,505.8,592.8z"/><path d="M998.5,431.7c-6.5,0-11.7-5.3-11.6-11.8c0.1-6.5,5.4-11.7,11.8-11.6c6.2,0.1,11.3,5.2,11.4,11.6C1010.2,426.3,1004.9,431.6,998.5,431.7z"/>`;

function showSplash(): void {
  if (!document.body) return;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes parotia-splash-dance {
      0%   { transform: rotate(0deg)    translateY(0)      scale(1); }
      25%  { transform: rotate(-110deg) translateY(-3px)   scale(1.1); }
      50%  { transform: rotate(-190deg) translateY(0)      scale(0.94); }
      75%  { transform: rotate(-300deg) translateY(-2px)   scale(1.06); }
      100% { transform: rotate(-360deg) translateY(0)      scale(1); }
    }
    @keyframes parotia-splash-glow {
      0%, 100% { filter: drop-shadow(0 0 10px rgba(193,232,153,0.4)); }
      50%      { filter: drop-shadow(0 0 30px rgba(193,232,153,0.85)); }
    }
    @keyframes parotia-splash-exit {
      0%   { transform: rotate(0)      scale(1);   opacity: 1; }
      100% { transform: rotate(-1080deg) scale(0); opacity: 0; }
    }
    @keyframes parotia-splash-overlay-out {
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.setAttribute("parotia-splash-overlay", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    background: "rgba(0,0,0,0.65)",
    opacity: "1",
    transition: "opacity 0.5s ease",
    pointerEvents: "none",
  });
  document.body.appendChild(overlay);

  const logo = document.createElement("div");
  logo.setAttribute("parotia-splash", "true");
  Object.assign(logo.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    width: "512px",
    height: "512px",
    marginTop: "-256px",
    marginLeft: "-256px",
    zIndex: "2147483647",
    pointerEvents: "none",
    color: "#c1e899",
  });
  logo.innerHTML = SPLASH_SVG;
  document.body.appendChild(logo);

  logo.style.animation =
    `parotia-splash-dance ${SPLASH_SPIN_SEC}s cubic-bezier(0.34,1.56,0.64,1) ${SPLASH_SPINS} forwards, ` +
    `parotia-splash-glow 0.55s ease-in-out infinite`;

  const exitDelay = SPLASH_SPIN_SEC * 1000 + 300;

  setTimeout(() => {
    logo.style.animation = `parotia-splash-exit 0.55s cubic-bezier(0.55,0,1,0.45) forwards`;
    overlay.style.opacity = "0";
    setTimeout(() => {
      logo.remove();
      overlay.remove();
      style.remove();
    }, 600);
  }, exitDelay);
}

/**
 * Overlay Runtime. The Parotia UI lives inside a Shadow DOM root so that
 * website CSS cannot affect Parotia controls and Parotia CSS cannot leak
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

export function isParotiaUi(target: Element | null): boolean {
  if (!target) return false;
  return target.closest(`[${OVERLAY_ROOT_MARKER}]`) !== null;
}

/** @deprecated Keep the old export during the selector compatibility window. */
export const isNewsCleanUi = isParotiaUi;

export function createOverlay(sessionId?: string): OverlayInstance {
  // ── Splash animation: logo spins and fades in the centre of the page ──
  showSplash();

  const root = document.createElement("div");
  root.id = OVERLAY_ROOT_ID;
  root.setAttribute(OVERLAY_ROOT_MARKER, "true");
  // Fixed: always pinned to the top of the viewport regardless of page layout.
  // Sticky was unreliable on sites with overflow:hidden ancestors. z-index
  // keeps page content from rendering over it.
  root.style.position = "fixed";
  root.style.top = "0px";
  root.style.left = "0px";
  root.style.zIndex = "2147483646";
  root.style.display = "block";
  root.style.width = "100%";
  root.style.pointerEvents = "auto";

  const shadow = root.attachShadow({ mode: "open" });

  // The React toolbar runs in an isolated iframe (web-accessible resource),
  // which gives full DOM/script isolation and keeps the page bundle small.
  const frame = document.createElement("iframe");
  const toolbarParams = encodeURIComponent(JSON.stringify({
    sessionId,
    parentOrigin: window.location.origin,
  }));
  frame.src = `${chrome.runtime.getURL("ui/index.html")}#${toolbarParams}`;
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
    if ((data?.source !== UI_MESSAGE_SOURCE && data?.source !== LEGACY_UI_MESSAGE_SOURCE) || data.type !== "RESIZE") return;
    const height = typeof data.height === "number" && data.height > 0 ? data.height : 0;
    frame.style.height = height > 0 ? `${height}px` : "";
  };
  window.addEventListener("message", onUiResize);

  if (document.body) {
    document.body.insertBefore(root, document.body.firstChild);
  } else {
    document.documentElement.appendChild(root);
  }

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
