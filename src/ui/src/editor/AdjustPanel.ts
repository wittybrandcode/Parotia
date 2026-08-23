/**
 * Brightness / contrast adjustment panel. Two sliders that apply CSS
 * filters to the canvas in real-time, with an "Apply" button that bakes
 * the current filter into the pixel data.
 */

export interface AdjustPanel {
  start(onApply: () => void, onCancel: () => void): void;
  stop(): void;
  getFilter(): string;
}

export function createAdjustPanel(
  previewSurface: HTMLElement,
  container: HTMLElement,
): AdjustPanel {
  let panel: HTMLDivElement | null = null;
  let brightness = 100;
  let contrast = 100;
  let onApply: (() => void) | null = null;
  let onCancel: (() => void) | null = null;

  function updateFilter(): void {
    previewSurface.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  }

  function getFilter(): string {
    return `brightness(${brightness}%) contrast(${contrast}%)`;
  }

  function start(applyCb: () => void, cancelCb: () => void): void {
    onApply = applyCb;
    onCancel = cancelCb;
    brightness = 100;
    contrast = 100;

    panel = document.createElement("div");
    panel.setAttribute("data-parotia-adjust-panel", "true");
    Object.assign(panel.style, {
      position: "absolute",
      bottom: "60px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: "8px",
      padding: "14px 20px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      zIndex: "15",
      minWidth: "240px",
    });

    const makeSlider = (label: string, min: number, max: number, initial: number, onChange: (v: number) => void) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";

      const lbl = document.createElement("span");
      lbl.textContent = label;
      Object.assign(lbl.style, { color: "#aaa", fontSize: "12px", minWidth: "70px" });

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(min);
      slider.max = String(max);
      slider.value = String(initial);
      Object.assign(slider.style, { flex: "1", accentColor: "#c1e899" });

      const val = document.createElement("span");
      val.textContent = `${initial}%`;
      Object.assign(val.style, { color: "#ccc", fontSize: "12px", minWidth: "40px", textAlign: "right" as const });

      slider.addEventListener("input", () => {
        const v = parseInt(slider.value, 10);
        val.textContent = `${v}%`;
        onChange(v);
      });

      row.appendChild(lbl);
      row.appendChild(slider);
      row.appendChild(val);
      return row;
    };

    panel.appendChild(makeSlider("Brightness", 0, 200, brightness, (v) => { brightness = v; updateFilter(); }));
    panel.appendChild(makeSlider("Contrast", 0, 200, contrast, (v) => { contrast = v; updateFilter(); }));

    // Apply / Cancel buttons
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.marginTop = "4px";

    const applyBtn = document.createElement("button");
    applyBtn.textContent = "Apply";
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
    applyBtn.addEventListener("click", () => { onApply?.(); stop(); });

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
    cancelBtn.addEventListener("click", () => { previewSurface.style.filter = ""; onCancel?.(); stop(); });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(applyBtn);
    panel.appendChild(btnRow);

    container.appendChild(panel);
    updateFilter();
  }

  function stop(): void {
    panel?.remove();
    panel = null;
    onApply = null;
    onCancel = null;
  }

  return { start, stop, getFilter };
}
