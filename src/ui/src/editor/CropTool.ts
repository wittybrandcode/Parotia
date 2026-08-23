/**
 * Crop tool — draws an interactive selection rectangle on a canvas overlay.
 * The user drags handles to define the crop region, then clicks "Apply" to
 * crop the image to that region.
 */

export interface CropTool {
  start(onApply: (rect: CropRect) => void, onCancel: () => void): void;
  stop(): void;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createCropTool(
  surface: HTMLElement,
  container: HTMLElement,
  imageWidth: number,
  imageHeight: number,
): CropTool {
  let overlay: HTMLDivElement | null = null;
  let box: HTMLDivElement | null = null;
  let handleEls: HTMLDivElement[] = [];
  let actionBar: HTMLDivElement | null = null;
  let dragging = false;
  let dragType = "";
  let startX = 0;
  let startY = 0;
  let cropRect: CropRect = { x: 0, y: 0, width: 0, height: 0 };
  let onApply: ((rect: CropRect) => void) | null = null;
  let onCancel: (() => void) | null = null;

  const HANDLE_SIZE = 10;

  function canvasToContainer(cx: number, cy: number): { x: number; y: number } {
    const r = surface.getBoundingClientRect();
    const sx = r.width / imageWidth;
    const sy = r.height / imageHeight;
    return { x: r.left - container.getBoundingClientRect().left + cx * sx, y: r.top - container.getBoundingClientRect().top + cy * sy };
  }

  function updateBox(): void {
    if (!box) return;
    const tl = canvasToContainer(cropRect.x, cropRect.y);
    const br = canvasToContainer(cropRect.x + cropRect.width, cropRect.y + cropRect.height);
    box.style.left = `${tl.x}px`;
    box.style.top = `${tl.y}px`;
    box.style.width = `${br.x - tl.x}px`;
    box.style.height = `${br.y - tl.y}px`;

    // Position handles at corners + midpoints
    const positions = [
      { x: tl.x, y: tl.y }, { x: (tl.x + br.x) / 2, y: tl.y }, { x: br.x, y: tl.y },
      { x: tl.x, y: (tl.y + br.y) / 2 }, { x: br.x, y: (tl.y + br.y) / 2 },
      { x: tl.x, y: br.y }, { x: (tl.x + br.x) / 2, y: br.y }, { x: br.x, y: br.y },
    ];
    const cursors = ["nw-resize", "n-resize", "ne-resize", "w-resize", "e-resize", "sw-resize", "s-resize", "se-resize"];
    handleEls.forEach((h, i) => {
      const pos = positions[i];
      const cur = cursors[i];
      if (pos && cur) {
        h.style.left = `${pos.x - HANDLE_SIZE / 2}px`;
        h.style.top = `${pos.y - HANDLE_SIZE / 2}px`;
        h.style.cursor = cur;
      }
    });

    // Action bar below the crop box
    if (actionBar) {
      actionBar.style.left = `${tl.x}px`;
      actionBar.style.top = `${br.y + 8}px`;
    }
  }

  function onMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const handleIdx = handleEls.indexOf(target as HTMLDivElement);
    if (handleIdx >= 0) {
      dragType = `handle-${handleIdx}`;
    } else if (target === box) {
      dragType = "move";
    } else {
      return;
    }
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    e.preventDefault();
    e.stopPropagation();
  }

  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;

    const r = surface.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const sx = imageWidth / r.width;
    const sy = imageHeight / r.height;

    if (dragType === "move") {
      cropRect.x = Math.max(0, Math.min(imageWidth - cropRect.width, cropRect.x + dx * sx));
      cropRect.y = Math.max(0, Math.min(imageHeight - cropRect.height, cropRect.y + dy * sy));
    } else if (dragType.startsWith("handle-")) {
      const idx = parseInt(dragType.split("-")[1] ?? "0", 10);
      const cdx = dx * sx;
      const cdy = dy * sy;
      // Handles: 0=nw, 1=n, 2=ne, 3=w, 4=e, 5=sw, 6=s, 7=se
      if (idx === 0 || idx === 3 || idx === 5) { cropRect.x += cdx; cropRect.width -= cdx; }
      if (idx === 2 || idx === 4 || idx === 7) { cropRect.width += cdx; }
      if (idx === 0 || idx === 1 || idx === 2) { cropRect.y += cdy; cropRect.height -= cdy; }
      if (idx === 5 || idx === 6 || idx === 7) { cropRect.height += cdy; }
      // Clamp: minimum 20px, within canvas bounds
      cropRect.width = Math.max(20, Math.min(imageWidth - cropRect.x, cropRect.width));
      cropRect.height = Math.max(20, Math.min(imageHeight - cropRect.y, cropRect.height));
      cropRect.x = Math.max(0, Math.min(imageWidth - cropRect.width, cropRect.x));
      cropRect.y = Math.max(0, Math.min(imageHeight - cropRect.height, cropRect.y));
    }
    updateBox();
  }

  function onMouseUp(): void {
    dragging = false;
  }

  function start(applyCb: (rect: CropRect) => void, cancelCb: () => void): void {
    onApply = applyCb;
    onCancel = cancelCb;

    // Create overlay
    overlay = document.createElement("div");
    overlay.setAttribute("data-parotia-crop-overlay", "true");
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: "10",
    });

    // Dark mask
    const mask = document.createElement("div");
    Object.assign(mask.style, {
      position: "absolute",
      inset: "0",
      background: "rgba(0,0,0,0.5)",
    });
    overlay.appendChild(mask);

    // Crop box
    box = document.createElement("div");
    box.setAttribute("data-parotia-crop-box", "true");
    Object.assign(box.style, {
      position: "absolute",
      border: "2px dashed #c1e899",
      cursor: "move",
      boxSizing: "border-box",
    });
    overlay.appendChild(box);

    // 8 handles
    for (let i = 0; i < 8; i++) {
      const h = document.createElement("div");
      Object.assign(h.style, {
        position: "absolute",
        width: `${HANDLE_SIZE}px`,
        height: `${HANDLE_SIZE}px`,
        background: "#c1e899",
        border: "1px solid #0a0a0a",
        borderRadius: "2px",
      });
      handleEls.push(h);
      overlay.appendChild(h);
    }

    // Action bar
    actionBar = document.createElement("div");
    Object.assign(actionBar.style, {
      position: "absolute",
      display: "flex",
      gap: "6px",
      zIndex: "11",
    });
    const applyBtn = document.createElement("button");
    applyBtn.textContent = "Crop";
    Object.assign(applyBtn.style, {
      padding: "4px 14px",
      background: "#c1e899",
      color: "#0a0a0a",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "600",
      fontSize: "13px",
    });
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onApply?.(cropRect);
      stop();
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    Object.assign(cancelBtn.style, {
      padding: "4px 14px",
      background: "#2a2a2a",
      color: "#ccc",
      border: "1px solid #444",
      borderRadius: "4px",
      cursor: "pointer",
      fontSize: "13px",
    });
    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onCancel?.();
      stop();
    });
    actionBar.appendChild(applyBtn);
    actionBar.appendChild(cancelBtn);
    overlay.appendChild(actionBar);

    container.appendChild(overlay);

    // Default crop rect = full image
    cropRect = { x: 0, y: 0, width: imageWidth, height: imageHeight };
    updateBox();

    // Events
    overlay.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function stop(): void {
    overlay?.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    overlay?.remove();
    overlay = null;
    box = null;
    handleEls = [];
    actionBar = null;
    dragging = false;
    onApply = null;
    onCancel = null;
  }

  return { start, stop };
}
