import { createRoot } from "react-dom/client";
import { App } from "./App";
import { UI_MESSAGE_SOURCE } from "@shared/constants";
import "./styles.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);

  // Report this iframe's height to the parent so the overlay can match the
  // iframe box to the toolbar. Without this the iframe keeps its default
  // 150px box and leaves a dark, empty area that covers the page below.
  // The message is targeted at the embedding page's origin instead of "*".
  let parentOrigin: string | null = null;
  try {
    const raw = window.location.hash.slice(1);
    const params = raw ? JSON.parse(decodeURIComponent(raw)) as { parentOrigin?: unknown } : {};
    if (typeof params.parentOrigin === "string") parentOrigin = new URL(params.parentOrigin).origin;
    else if (document.referrer) parentOrigin = new URL(document.referrer).origin;
  } catch {
    parentOrigin = null;
  }
  const reportHeight = (): void => {
    const height = Math.ceil(container.scrollHeight);
    if (height > 0 && parentOrigin) {
      window.parent.postMessage({ source: UI_MESSAGE_SOURCE, type: "RESIZE", height }, parentOrigin);
    }
  };

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(reportHeight);
    observer.observe(container);
  }
  window.addEventListener("load", reportHeight);
  reportHeight();
}
