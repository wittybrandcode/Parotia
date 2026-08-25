export type ViewportMode = "FIT" | "FILL" | "ACTUAL" | "CUSTOM";

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface ViewportState {
  scale: number;
  percent: number;
  mode: ViewportMode;
  offsetX: number;
  offsetY: number;
}

export interface EditorViewport {
  readonly state: ViewportState;
  fit(): void;
  fill(): void;
  actualSize(): void;
  zoomBy(factor: number, anchor?: ViewportPoint): void;
  setScale(scale: number, anchor?: ViewportPoint): void;
  panBy(deltaX: number, deltaY: number): void;
  refresh(): void;
  setGesturesEnabled(enabled: boolean): void;
  destroy(): void;
}

export interface EditorViewportOptions {
  minScale?: number;
  maxScale?: number;
  padding?: number;
  minVisible?: number;
  onChange?: (state: ViewportState) => void;
}

const DEFAULT_MIN_SCALE = 0.05;
const DEFAULT_MAX_SCALE = 8;
const DEFAULT_PADDING = 16;
const DEFAULT_MIN_VISIBLE = 48;
const ZOOM_SENSITIVITY = 0.002;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

/**
 * Controls only the presentation of the native-resolution editor surface.
 * Export and annotation coordinates remain independent from this transform.
 */
export function createEditorViewport(
  viewport: HTMLDivElement,
  surface: HTMLDivElement,
  imageWidth: number,
  imageHeight: number,
  options: EditorViewportOptions = {},
): EditorViewport {
  if (imageWidth <= 0 || imageHeight <= 0) throw new Error("Viewport image dimensions must be positive");

  const minScale = options.minScale ?? DEFAULT_MIN_SCALE;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;
  const padding = options.padding ?? DEFAULT_PADDING;
  const minVisible = options.minVisible ?? DEFAULT_MIN_VISIBLE;
  if (minScale <= 0 || maxScale < minScale) throw new Error("Invalid viewport scale limits");

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let mode: ViewportMode = "FIT";
  let gesturesEnabled = true;
  let spacePressed = false;
  let dragging = false;
  let dragPointerId: number | null = null;
  let lastPointer = { x: 0, y: 0 };
  let destroyed = false;

  const previousStyle = {
    position: surface.style.position,
    left: surface.style.left,
    top: surface.style.top,
    width: surface.style.width,
    height: surface.style.height,
    transform: surface.style.transform,
    transformOrigin: surface.style.transformOrigin,
    willChange: surface.style.willChange,
  };

  surface.style.position = "absolute";
  surface.style.left = "0";
  surface.style.top = "0";
  surface.style.width = `${imageWidth}px`;
  surface.style.height = `${imageHeight}px`;
  surface.style.transformOrigin = "0 0";
  surface.style.willChange = "transform";

  function dimensions(): { width: number; height: number } {
    const rect = viewport.getBoundingClientRect();
    return {
      width: Math.max(1, rect.width || viewport.clientWidth || imageWidth + padding * 2),
      height: Math.max(1, rect.height || viewport.clientHeight || imageHeight + padding * 2),
    };
  }

  function fitScale(): number {
    const size = dimensions();
    return clamp(Math.min(1, (size.width - padding * 2) / imageWidth, (size.height - padding * 2) / imageHeight), minScale, maxScale);
  }

  function fillScale(): number {
    const size = dimensions();
    return clamp(Math.max((size.width - padding * 2) / imageWidth, (size.height - padding * 2) / imageHeight), minScale, maxScale);
  }

  function center(): void {
    const size = dimensions();
    offsetX = (size.width - imageWidth * scale) / 2;
    offsetY = (size.height - imageHeight * scale) / 2;
  }

  function constrain(): void {
    const size = dimensions();
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;
    offsetX = scaledWidth <= size.width
      ? (size.width - scaledWidth) / 2
      : clamp(offsetX, minVisible - scaledWidth, size.width - minVisible);
    offsetY = scaledHeight <= size.height
      ? (size.height - scaledHeight) / 2
      : clamp(offsetY, minVisible - scaledHeight, size.height - minVisible);
  }

  function snapshot(): ViewportState {
    return { scale, percent: Math.round(scale * 100), mode, offsetX, offsetY };
  }

  function commitPresentation(): void {
    if (destroyed) return;
    surface.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
    options.onChange?.(snapshot());
  }

  function apply(): void {
    constrain();
    commitPresentation();
  }

  function localPoint(clientX: number, clientY: number): ViewportPoint {
    const rect = viewport.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function setScale(nextScale: number, anchor?: ViewportPoint): void {
    const boundedScale = clamp(nextScale, minScale, maxScale);
    const size = dimensions();
    const focalPoint = anchor ?? { x: size.width / 2, y: size.height / 2 };
    const imageX = (focalPoint.x - offsetX) / scale;
    const imageY = (focalPoint.y - offsetY) / scale;
    scale = boundedScale;
    offsetX = focalPoint.x - imageX * scale;
    offsetY = focalPoint.y - imageY * scale;
    mode = Math.abs(scale - 1) < 0.0001 ? "ACTUAL" : "CUSTOM";
    apply();
  }

  function fit(): void {
    scale = fitScale();
    mode = "FIT";
    center();
    apply();
  }

  function fill(): void {
    scale = fillScale();
    mode = "FILL";
    center();
    apply();
  }

  function actualSize(): void {
    scale = clamp(1, minScale, maxScale);
    mode = "ACTUAL";
    center();
    apply();
  }

  function zoomBy(factor: number, anchor?: ViewportPoint): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    setScale(scale * factor, anchor);
  }

  function panBy(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    const previousX = offsetX;
    const previousY = offsetY;
    offsetX += deltaX;
    offsetY += deltaY;
    constrain();
    if (Math.abs(offsetX - previousX) > 0.001 || Math.abs(offsetY - previousY) > 0.001) mode = "CUSTOM";
    commitPresentation();
  }

  function refresh(): void {
    if (mode === "FIT") fit();
    else if (mode === "FILL") fill();
    else apply();
  }

  function updatePanReadyClass(): void {
    viewport.classList.toggle("nc-editor-viewport-pan-ready", gesturesEnabled && spacePressed && !dragging);
    viewport.classList.toggle("nc-editor-viewport-panning", dragging);
  }

  function stopDragging(): void {
    dragging = false;
    dragPointerId = null;
    updatePanReadyClass();
  }

  function onWheel(event: WheelEvent): void {
    if (!gesturesEnabled) return;
    event.preventDefault();
    const deltaX = Number.isFinite(event.deltaX) ? event.deltaX : 0;
    const deltaY = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    if (event.ctrlKey || event.metaKey) {
      const size = dimensions();
      const anchor = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? localPoint(event.clientX, event.clientY)
        : { x: size.width / 2, y: size.height / 2 };
      zoomBy(Math.exp(-deltaY * ZOOM_SENSITIVITY), anchor);
      return;
    }
    panBy(-deltaX, -deltaY);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!gesturesEnabled || (event.button !== 1 && !(event.button === 0 && spacePressed))) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    dragPointerId = event.pointerId;
    lastPointer = { x: event.clientX, y: event.clientY };
    try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional in test DOMs. */ }
    updatePanReadyClass();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const deltaX = event.clientX - lastPointer.x;
    const deltaY = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    panBy(deltaX, deltaY);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId) return;
    try { viewport.releasePointerCapture(event.pointerId); } catch { /* Pointer capture is optional in test DOMs. */ }
    stopDragging();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code !== "Space" || isEditableTarget(event.target) || event.repeat) return;
    spacePressed = true;
    event.preventDefault();
    updatePanReadyClass();
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.code !== "Space") return;
    spacePressed = false;
    stopDragging();
  }

  function setGesturesEnabled(enabled: boolean): void {
    gesturesEnabled = enabled;
    if (!enabled) {
      spacePressed = false;
      stopDragging();
    }
    updatePanReadyClass();
  }

  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("pointerdown", onPointerDown, { capture: true });
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerEnd);
  viewport.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", stopDragging);
  window.addEventListener("resize", refresh);

  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
  resizeObserver?.observe(viewport);
  fit();

  return {
    get state() { return snapshot(); },
    fit,
    fill,
    actualSize,
    zoomBy,
    setScale,
    panBy,
    refresh,
    setGesturesEnabled,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown, { capture: true });
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerEnd);
      viewport.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopDragging);
      window.removeEventListener("resize", refresh);
      viewport.classList.remove("nc-editor-viewport-pan-ready", "nc-editor-viewport-panning");
      Object.assign(surface.style, previousStyle);
    },
  };
}
