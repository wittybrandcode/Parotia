import type { Rect } from "@shared/types";

/**
 * Free Selection Capture — two-phase overlay. Phase 1: the user draws a
 * rectangle on a dimmed page. Phase 2: the zone stays visible with resize
 * handles and a floating Capture / Cancel toolbar. The promise resolves only
 * when the user clicks Capture (or cancels with Escape / Cancel).
 */

const OVERLAY_Z = "2147483645";
const HANDLE_Z = String(Number(OVERLAY_Z) + 1);
const BAR_Z = String(Number(OVERLAY_Z) + 2);
const MIN_SIZE_PX = 8;

export interface FreeSelectResult {
  rect: Rect;
  scrollY: number;
  dpr: number;
}

/**
 * Activates the free-selection overlay and resolves when the user confirms
 * a region (Capture button) or cancels (Escape / Cancel button).
 *
 * Phase 1 — draw: click-drag on the dimmed background creates a rectangle.
 * Phase 2 — adjust + confirm: the rectangle shows 8 resize handles and a
 *           small floating toolbar below it with Capture and Cancel buttons.
 *           The user can drag the rectangle to move it, drag handles to
 *           resize, and finally click Capture to confirm or Cancel/Escape to
 *           dismiss. The returned Rect is in CSS viewport coordinates.
 */
export function startFreeSelect(): Promise<FreeSelectResult | null> {
  return new Promise((resolve) => {
    const disposables: HTMLElement[] = [];
    let cleaned = false;

    /* ── dimmed backdrop ─────────────────────────────────────────────── */
    const dim = el("div", {
      "data-newsclean-freeselect": "true",
      style: `position:fixed;inset:0;z-index:${OVERLAY_Z};background:rgba(0,0,0,0.3);cursor:crosshair;`,
    });
    disposables.push(dim);

    /* ── selection rectangle ─────────────────────────────────────────── */
    const sel = el("div", {
      "data-newsclean-freeselect-rect": "true",
      style: `position:fixed;border:2px solid #2196F3;background:rgba(33,150,243,0.1);display:none;pointer-events:none;z-index:${OVERLAY_Z};`,
    });
    disposables.push(sel);

    /* ── dimension label ─────────────────────────────────────────────── */
    const label = el("div", {
      "data-newsclean-freeselect-label": "true",
      style: `position:fixed;display:none;z-index:${HANDLE_Z};color:#fff;font:600 11px/1 system-ui,sans-serif;background:rgba(0,0,0,0.65);padding:2px 6px;border-radius:3px;pointer-events:none;white-space:nowrap;`,
    });
    disposables.push(label);

    /* ── resize handles ──────────────────────────────────────────────── */
    const handles = [
      "nw", "n", "ne", "e", "se", "s", "sw", "w",
    ].map((pos) => {
      const h = el("div", {
        "data-newsclean-freeselect-handle": pos,
        style: `position:fixed;width:8px;height:8px;background:#2196F3;border:1px solid white;border-radius:2px;display:none;pointer-events:auto;z-index:${HANDLE_Z};cursor:${handleCursor(pos)};`,
      });
      disposables.push(h);
      return h;
    });

    /* ── floating capture toolbar ────────────────────────────────────── */
    const bar = el("div", {
      "data-newsclean-freeselect-bar": "true",
      style: `position:fixed;display:none;z-index:${BAR_Z};background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:4px 6px;display:none;gap:4px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);`,
    });
    disposables.push(bar);

    const captureBtn = el("button", {
      "data-newsclean-freeselect-capture": "true",
      "aria-label": "Capture this region",
      title: "Capture this region",
      style: `display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border:none;border-radius:4px;background:#2196F3;color:#fff;cursor:pointer;font-size:14px;line-height:1;padding:0;`,
    });
    captureBtn.textContent = "\u{1F4F7}";
    bar.append(captureBtn);

    const cancelBtn = el("button", {
      "data-newsclean-freeselect-cancel": "true",
      "aria-label": "Cancel selection",
      title: "Cancel selection (Esc)",
      style: `display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:4px;background:#444;color:#ccc;cursor:pointer;font-size:14px;line-height:1;padding:0;`,
    });
    cancelBtn.textContent = "\u2715";
    bar.append(cancelBtn);

    document.documentElement.append(dim, sel, label, bar, ...handles);

    /* ── state ───────────────────────────────────────────────────────── */
    let phase: "drawing" | "adjusting" = "drawing";
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let curX = 0;
    let curY = 0;

    // Adjust-phase state
    let currentRect: Rect = { x: 0, y: 0, width: 0, height: 0 };
    let moving = false;
    let moveAnchorX = 0;
    let moveAnchorY = 0;
    let moveRectX = 0;
    let moveRectY = 0;
    let resizing = false;
    let resizeHandle = "";
    let resizeAnchorX = 0;
    let resizeAnchorY = 0;
    let resizeRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

    /* ── cleanup ─────────────────────────────────────────────────────── */
    function cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      for (const d of disposables) d.remove();
      window.removeEventListener("keydown", onKey, true);
      dim.removeEventListener("mousedown", onDimDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      sel.removeEventListener("mousedown", onSelDown);
      for (const h of handles) h.removeEventListener("mousedown", onHandleDown);
      captureBtn.removeEventListener("click", onCapture);
      cancelBtn.removeEventListener("click", onCancel);
    }

    /* ── keyboard ────────────────────────────────────────────────────── */
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        resolve(null);
      }
    }

    /* ── phase 1: drawing ────────────────────────────────────────────── */
    function onDimDown(e: MouseEvent): void {
      if (phase !== "drawing") return;
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      curX = startX;
      curY = startY;
      dragging = true;
      sel.style.display = "block";
      paint();
    }

    /* ── phase 2: move ───────────────────────────────────────────────── */
    function onSelDown(e: MouseEvent): void {
      if (phase !== "adjusting") return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      moving = true;
      moveAnchorX = e.clientX;
      moveAnchorY = e.clientY;
      moveRectX = currentRect.x;
      moveRectY = currentRect.y;
    }

    /* ── phase 2: resize ─────────────────────────────────────────────── */
    function onHandleDown(e: MouseEvent): void {
      if (phase !== "adjusting") return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = (e.currentTarget as HTMLElement).getAttribute("data-newsclean-freeselect-handle") ?? "";
      if (!pos) return;
      resizing = true;
      resizeHandle = pos;
      resizeAnchorX = e.clientX;
      resizeAnchorY = e.clientY;
      resizeRect = { ...currentRect };
    }

    /* ── shared move / up ────────────────────────────────────────────── */
    function onMove(e: MouseEvent): void {
      if (dragging) {
        curX = e.clientX;
        curY = e.clientY;
        paint();
      } else if (moving) {
        const dx = e.clientX - moveAnchorX;
        const dy = e.clientY - moveAnchorY;
        currentRect.x = moveRectX + dx;
        currentRect.y = moveRectY + dy;
        paintAdjust();
      } else if (resizing) {
        applyResize(e.clientX, e.clientY);
        paintAdjust();
      }
    }

    function onUp(_e: MouseEvent): void {
      if (dragging) {
        dragging = false;
        const rect = normalise(startX, startY, curX, curY);
        if (rect.width < MIN_SIZE_PX || rect.height < MIN_SIZE_PX) {
          // Too small — reset, stay in drawing phase.
          sel.style.display = "none";
          hideHandles();
          return;
        }
        currentRect = rect;
        phase = "adjusting";
        dim.style.cursor = "default";
        sel.style.pointerEvents = "auto";
        paintAdjust();
        return;
      }
      if (moving) {
        moving = false;
      }
      if (resizing) {
        resizing = false;
      }
    }

    /* ── confirm / cancel buttons ────────────────────────────────────── */
    function onCapture(_e: MouseEvent): void {
      _e.preventDefault();
      _e.stopPropagation();
      if (phase !== "adjusting") return;
      if (currentRect.width < MIN_SIZE_PX || currentRect.height < MIN_SIZE_PX) return;
      cleanup();
      resolve({
        rect: { ...currentRect },
        scrollY: window.scrollY,
        dpr: window.devicePixelRatio || 1,
      });
    }

    function onCancel(_e: MouseEvent): void {
      _e.preventDefault();
      _e.stopPropagation();
      cleanup();
      resolve(null);
    }

    /* ── paint: drawing phase ─────────────────────────────────────────── */
    function paint(): void {
      const r = normalise(startX, startY, curX, curY);
      Object.assign(sel.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      positionHandles(r);
      updateLabel(r);
    }

    /* ── paint: adjust phase ─────────────────────────────────────────── */
    function paintAdjust(): void {
      const r = currentRect;
      Object.assign(sel.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      positionHandles(r);
      updateLabel(r);
      positionBar(r);
    }

    /* ── handle positioning (shared) ─────────────────────────────────── */
    function positionHandles(r: Rect): void {
      const coords: [number, number][] = [
        [r.x, r.y],                       // nw
        [r.x + r.width / 2, r.y],         // n
        [r.x + r.width, r.y],             // ne
        [r.x + r.width, r.y + r.height / 2], // e
        [r.x + r.width, r.y + r.height],  // se
        [r.x + r.width / 2, r.y + r.height], // s
        [r.x, r.y + r.height],            // sw
        [r.x, r.y + r.height / 2],        // w
      ];
      for (let i = 0; i < handles.length; i++) {
        const coord = coords[i];
        const handle = handles[i];
        if (!coord || !handle) continue;
        const [hx, hy] = coord;
        Object.assign(handle.style, {
          display: "block",
          left: `${hx - 4}px`,
          top: `${hy - 4}px`,
        });
      }
    }

    function hideHandles(): void {
      for (const h of handles) h.style.display = "none";
    }

    function updateLabel(r: Rect): void {
      label.textContent = `${Math.round(r.width)} x ${Math.round(r.height)}`;
      label.style.display = "block";
      const lx = r.x;
      const ly = r.y > 22 ? r.y - 20 : r.y + r.height + 4;
      Object.assign(label.style, { left: `${lx}px`, top: `${ly}px` });
    }

    function positionBar(r: Rect): void {
      bar.style.display = "flex";
      const bw = 72; // approximate bar width
      const bx = r.x + r.width / 2 - bw / 2;
      const by = r.y + r.height + 8;
      Object.assign(bar.style, { left: `${bx}px`, top: `${by}px` });
    }

    /* ── resize logic ────────────────────────────────────────────────── */
    function applyResize(mx: number, my: number): void {
      const dx = mx - resizeAnchorX;
      const dy = my - resizeAnchorY;
      const o = resizeRect;
      let x = o.x;
      let y = o.y;
      let w = o.width;
      let h = o.height;

      if (resizeHandle.includes("e")) { w = o.width + dx; }
      if (resizeHandle.includes("w")) { x = o.x + dx; w = o.width - dx; }
      if (resizeHandle.includes("s")) { h = o.height + dy; }
      if (resizeHandle.includes("n")) { y = o.y + dy; h = o.height - dy; }

      // Normalise negatives (drag past opposite edge).
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }

      currentRect = { x, y, width: w, height: h };
    }

    /* ── wire events ─────────────────────────────────────────────────── */
    window.addEventListener("keydown", onKey, true);
    dim.addEventListener("mousedown", onDimDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    sel.addEventListener("mousedown", onSelDown);
    for (const h of handles) h.addEventListener("mousedown", onHandleDown);
    captureBtn.addEventListener("click", onCapture);
    cancelBtn.addEventListener("click", onCancel);
  });
}

function normalise(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function el(tag: string, attrs: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  return e;
}

function handleCursor(pos: string): string {
  const map: Record<string, string> = {
    nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize",
    e: "ew-resize", se: "nwse-resize", s: "ns-resize",
    sw: "nesw-resize", w: "ew-resize",
  };
  return map[pos] ?? "default";
}
