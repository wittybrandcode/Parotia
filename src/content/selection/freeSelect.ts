import type { Rect } from "@shared/types";

/**
 * Free Selection Capture — lets the user draw a rectangle on a dimmed page to
 * select an arbitrary region for capture. The overlay is appended to <html>
 * (above every page element) and fully cleaned up on completion or cancellation.
 */

const OVERLAY_Z = "2147483645";
const HANDLE_Z = String(Number(OVERLAY_Z) + 1);
const MIN_SIZE_PX = 8;

export interface FreeSelectResult {
  rect: Rect;
  scrollY: number;
  dpr: number;
}

/**
 * Activates the free-selection overlay and resolves when the user draws a
 * rectangle (or cancels with Escape). The returned Rect is in CSS viewport
 * coordinates (clientX / clientY), ready for device-pixel conversion.
 */
export function startFreeSelect(): Promise<FreeSelectResult | null> {
  return new Promise((resolve) => {
    const disposables: HTMLElement[] = [];
    let cleaned = false;

    const dim = el("div", {
      "data-newsclean-freeselect": "true",
      style: `position:fixed;inset:0;z-index:${OVERLAY_Z};background:rgba(0,0,0,0.3);cursor:crosshair;`,
    });
    disposables.push(dim);

    const sel = el("div", {
      "data-newsclean-freeselect-rect": "true",
      style: `position:fixed;border:2px solid #2196F3;background:rgba(33,150,243,0.1);display:none;pointer-events:none;z-index:${OVERLAY_Z};`,
    });
    disposables.push(sel);

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

    document.documentElement.append(dim, sel, ...handles);

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let curX = 0;
    let curY = 0;

    function cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      for (const d of disposables) d.remove();
      window.removeEventListener("keydown", onKey, true);
      dim.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        resolve(null);
      }
    }

    function onDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      curX = startX;
      curY = startY;
      dragging = true;
      sel.style.display = "block";
      paint();
    }

    function onMove(e: MouseEvent): void {
      if (!dragging) return;
      curX = e.clientX;
      curY = e.clientY;
      paint();
    }

    function onUp(e: MouseEvent): void {
      if (!dragging) return;
      dragging = false;
      const rect = normalise(startX, startY, e.clientX, e.clientY);
      if (rect.width < MIN_SIZE_PX || rect.height < MIN_SIZE_PX) {
        cleanup();
        resolve(null);
        return;
      }
      cleanup();
      resolve({
        rect,
        scrollY: window.scrollY,
        dpr: window.devicePixelRatio || 1,
      });
    }

    function paint(): void {
      const r = normalise(startX, startY, curX, curY);
      Object.assign(sel.style, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      const coords: [number, number][] = [
        [r.x, r.y],
        [r.x + r.width / 2, r.y],
        [r.x + r.width, r.y],
        [r.x + r.width, r.y + r.height / 2],
        [r.x + r.width, r.y + r.height],
        [r.x + r.width / 2, r.y + r.height],
        [r.x, r.y + r.height],
        [r.x, r.y + r.height / 2],
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

    window.addEventListener("keydown", onKey, true);
    dim.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
