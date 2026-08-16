import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);

  // Report this iframe's height to the parent so the overlay can match the
  // iframe box to the toolbar. Without this the iframe keeps its default
  // 150px box and leaves a dark, empty area that covers the page below.
  const reportHeight = (): void => {
    const height = Math.ceil(container.scrollHeight);
    if (height > 0) {
      window.parent.postMessage({ source: "newsclean-ui", type: "RESIZE", height }, "*");
    }
  };

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(reportHeight);
    observer.observe(container);
  }
  window.addEventListener("load", reportHeight);
  reportHeight();
}
