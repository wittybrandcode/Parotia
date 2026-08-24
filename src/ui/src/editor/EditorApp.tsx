import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Circle, Copy, Download, Maximize2, Minus, Pencil, Redo2, Scissors, Share2, SlidersHorizontal, Square, Type, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { createCanvasEngine, type CanvasEngine } from "./CanvasEngine";
import { createCropTool, type CropRect, type CropTool } from "./CropTool";
import { createAnnotationLayer, type AnnotationLayer, type AnnotateTool } from "./AnnotationLayer";
import { createAdjustPanel, type AdjustPanel } from "./AdjustPanel";
import { createEditorDocument, type EditorDocument } from "./EditorDocument";
import { addLayerCommand, EditorDocumentHistory, replaceDocumentCommand } from "./EditorDocumentHistory";
import { createEditorViewport, type EditorViewport, type ViewportState } from "./EditorViewport";
import {
  assessEditorImage,
  detectedDeviceMemoryGb,
  editorBypassWarning,
  formatEditorImageIdentity,
} from "@shared/utils/editorPreflight";

type ActiveTool = null | "annotate" | "crop" | "adjust";
type EditorParams = { imageKey?: string; filename?: string; editorToken?: string; parentOrigin?: string };
const canShare = typeof navigator !== "undefined" && "share" in navigator;

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Failed to encode PNG")), "image/png"));
}

export function EditorApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const konvaContainerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const annotationRef = useRef<AnnotationLayer | null>(null);
  const cropRef = useRef<CropTool | null>(null);
  const adjustRef = useRef<AdjustPanel | null>(null);
  const viewportRef = useRef<EditorViewport | null>(null);
  const paramsRef = useRef<EditorParams>({});
  const operationRef = useRef(false);
  const historyRef = useRef<EditorDocumentHistory | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<ActiveTool>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [operating, setOperating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState("parotia-capture.png");
  const [imageIdentity, setImageIdentity] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState("#c1e899");
  const [drawWidth, setDrawWidth] = useState(3);
  const [textSize, setTextSize] = useState(24);
  const [shapeKind, setShapeKind] = useState<AnnotateTool>("freehand");
  const [viewportState, setViewportState] = useState<ViewportState>({ scale: 1, percent: 100, mode: "FIT", offsetX: 0, offsetY: 0 });

  const refreshHistory = useCallback(() => {
    setCanUndo(historyRef.current?.canUndo ?? false);
    setCanRedo(historyRef.current?.canRedo ?? false);
  }, []);

  const initAnnotation = useCallback(async (document: EditorDocument): Promise<void> => {
    const container = konvaContainerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) throw new Error("Editor surface is unavailable");
    viewportRef.current?.destroy();
    viewportRef.current = null;
    annotationRef.current?.destroy();
    container.replaceChildren();
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to render the captured image"));
      image.src = document.background.source;
    });
    const annotation = createAnnotationLayer();
    annotation.init(container, document.canvas.width, document.canvas.height, image);
    annotation.setOptions({ color: drawColor, strokeWidth: drawWidth, fontSize: textSize });
    annotation.setTool(shapeKind);
    annotationRef.current = annotation;
    await annotation.loadLayers(document.layers);
    viewportRef.current = createEditorViewport(wrapper, container, document.canvas.width, document.canvas.height, { onChange: setViewportState });
    annotation.setCommitListener((layer) => {
      if (operationRef.current) return;
      try {
        const history = historyRef.current;
        if (!history) throw new Error("Editor document history is unavailable");
        history.execute(addLayerCommand(layer));
        setSaved(false);
        refreshHistory();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to record the annotation layer");
      }
    });
    cropRef.current?.stop();
    adjustRef.current?.stop();
    cropRef.current = createCropTool(container, wrapper, document.canvas.width, document.canvas.height);
    adjustRef.current = createAdjustPanel(container, wrapper);
    refreshHistory();
  }, [drawColor, drawWidth, textSize, shapeKind, refreshHistory]);

  const renderEditor = useCallback((target: HTMLCanvasElement): void => {
    const annotation = annotationRef.current;
    if (!annotation) throw new Error("Editor is not ready");
    annotation.renderTo(target);
  }, []);

  const runExclusive = useCallback(async (operation: () => Promise<void> | void): Promise<boolean> => {
    if (operationRef.current) {
      setError("Another editor operation is still running");
      return false;
    }
    operationRef.current = true;
    setOperating(true);
    setError(null);
    try {
      await operation();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Editor operation failed");
      return false;
    } finally {
      operationRef.current = false;
      setOperating(false);
    }
  }, []);

  const commitRenderedImage = useCallback(async (label: string, transform?: (engine: CanvasEngine) => void): Promise<void> => {
    await runExclusive(async () => {
      const engine = engineRef.current;
      const history = historyRef.current;
      if (!engine || !history) throw new Error("Editor is not ready");
      const before = history.document;
      renderEditor(engine.canvas);
      transform?.(engine);
      const next = engine.toDataURL();
      const replacement = createEditorDocument({ source: next, width: engine.width, height: engine.height, id: before.id });
      const after: EditorDocument = { ...replacement, createdAt: before.createdAt };
      history.execute(replaceDocumentCommand(before, after, label));
      setSaved(false);
      await initAnnotation(after);
      setTool(null);
      refreshHistory();
    });
  }, [initAnnotation, refreshHistory, renderEditor, runExclusive]);

  const restoreHistory = useCallback(async (direction: "undo" | "redo"): Promise<void> => {
    await runExclusive(async () => {
      const history = historyRef.current;
      if (!history) throw new Error("Editor document history is unavailable");
      const document = direction === "undo" ? history.undo() : history.redo();
      if (!document) return;
      const engine = engineRef.current;
      if (!engine) throw new Error("Editor is not ready");
      try {
        await engine.loadImage(document.background.source);
        await initAnnotation(document);
        setSaved(false);
        refreshHistory();
      } catch (cause) {
        if (direction === "undo") history.redo();
        else history.undo();
        refreshHistory();
        throw cause;
      }
    });
  }, [initAnnotation, refreshHistory, runExclusive]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const hash = window.location.hash.slice(1);
        const params = hash ? JSON.parse(decodeURIComponent(hash)) as EditorParams : {};
        if (!params.imageKey || !params.editorToken) throw new Error("Missing editor session");
        paramsRef.current = params;
        setFilename(params.filename || "parotia-capture.png");
        const stored = await chrome.storage.local.get(params.imageKey);
        const dataUrl = stored?.[params.imageKey];
        if (typeof dataUrl !== "string") throw new Error("The captured image is no longer available");
        const preflight = assessEditorImage(dataUrl, detectedDeviceMemoryGb());
        if (preflight.metadata) setImageIdentity(formatEditorImageIdentity(preflight.metadata));
        await chrome.storage.local.remove(params.imageKey);
        if (preflight.mode === "BYPASS") throw new Error(editorBypassWarning(preflight));
        if (!canvasRef.current) throw new Error("Editor canvas is unavailable");
        const engine = createCanvasEngine(canvasRef.current);
        engineRef.current = engine;
        await engine.loadImage(dataUrl);
        const document = createEditorDocument({ source: dataUrl, width: engine.width, height: engine.height });
        historyRef.current = new EditorDocumentHistory(document);
        await initAnnotation(document);
        setLoaded(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to open editor");
      }
    };
    void load();
    // The source image is single-use storage data. This must run once only;
    // re-running after a colour/tool state change would consume it again.
  }, []);

  useEffect(() => () => {
    viewportRef.current?.destroy();
    annotationRef.current?.destroy();
    cropRef.current?.stop();
    adjustRef.current?.stop();
    engineRef.current?.destroy();
    historyRef.current?.clear();
    historyRef.current = null;
  }, []);

  useEffect(() => {
    viewportRef.current?.setGesturesEnabled(loaded && !operating && tool !== "crop");
  }, [loaded, operating, tool]);

  useEffect(() => {
    cropRef.current?.stop();
    adjustRef.current?.stop();
    const annotation = annotationRef.current;
    if (!loaded || !annotation) return;
    if (tool === "annotate") {
      annotation.setTool(shapeKind);
      annotation.setOptions({ color: drawColor, strokeWidth: drawWidth, fontSize: textSize });
    }
    if (tool === "crop" && cropRef.current) {
      cropRef.current.start((rect: CropRect) => {
        void commitRenderedImage("Crop image", (engine) => {
          const context = engine.canvas.getContext("2d");
          if (!context) throw new Error("Cannot crop image");
          const data = context.getImageData(rect.x, rect.y, rect.width, rect.height);
          engine.resize(rect.width, rect.height);
          context.putImageData(data, 0, 0);
        });
      }, () => setTool(null));
    }
    if (tool === "adjust" && adjustRef.current) {
      adjustRef.current.start(() => {
        const filter = adjustRef.current?.getFilter() ?? "none";
        const surface = konvaContainerRef.current;
        if (surface) surface.style.filter = "";
        void commitRenderedImage("Adjust image", (engine) => {
          engine.applyFilter(filter);
        });
      }, () => setTool(null));
    }
    return () => {
      cropRef.current?.stop();
      adjustRef.current?.stop();
    };
  }, [tool, loaded, drawColor, drawWidth, textSize, shapeKind, commitRenderedImage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); void restoreHistory("undo"); }
      else if (modifier && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) { event.preventDefault(); void restoreHistory("redo"); }
      else if (modifier && (event.key === "+" || event.key === "=")) { event.preventDefault(); viewportRef.current?.zoomBy(1.2); }
      else if (modifier && event.key === "-") { event.preventDefault(); viewportRef.current?.zoomBy(1 / 1.2); }
      else if (event.key === "0") { event.preventDefault(); viewportRef.current?.fit(); }
      else if (event.key === "1") { event.preventDefault(); viewportRef.current?.actualSize(); }
      else if (event.key === "Escape") setTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restoreHistory]);

  const exportCanvas = useCallback((): HTMLCanvasElement => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Editor is not ready");
    const target = document.createElement("canvas");
    target.width = engine.width;
    target.height = engine.height;
    renderEditor(target);
    return target;
  }, [renderEditor]);

  const handleDownload = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);
    await runExclusive(async () => {
      const editorToken = paramsRef.current.editorToken;
      if (!editorToken) throw new Error("Missing editor permission");
      const result = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_EDITOR_RESULT",
        payload: { editorToken, dataUrl: exportCanvas().toDataURL("image/png"), filename },
      }) as { success?: boolean; error?: { message?: string } };
      if (!result?.success) throw new Error(result?.error?.message || "Could not save the image");
      delete paramsRef.current.editorToken;
      setSaved(true);
    });
    setSaving(false);
  }, [saving, saved, exportCanvas, filename, runExclusive]);

  const handleCopy = useCallback(async () => {
    await runExclusive(async () => {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": await canvasBlob(exportCanvas()) })]);
    });
  }, [exportCanvas, runExclusive]);

  const handleShare = useCallback(async () => {
    await runExclusive(async () => {
      const file = new File([await canvasBlob(exportCanvas())], filename, { type: "image/png" });
      try {
        await navigator.share({ files: [file] });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        throw cause;
      }
    });
  }, [exportCanvas, filename, runExclusive]);

  const handleClose = useCallback(async () => {
    await runExclusive(async () => {
      const editorToken = paramsRef.current.editorToken;
      if (editorToken) {
        await Promise.race([
          chrome.runtime.sendMessage({ type: "DISCARD_EDITOR_RESULT", payload: { editorToken } }),
          new Promise((resolve) => window.setTimeout(resolve, 1500)),
        ]);
        delete paramsRef.current.editorToken;
      }
      const parentOrigin = paramsRef.current.parentOrigin;
      if (parentOrigin) window.parent.postMessage({ source: "parotia-editor", type: "EDITOR_CLOSE" }, parentOrigin);
    });
  }, [runExclusive]);

  return <div className="nc-editor-root">
    <div className="nc-editor-topbar">
      <div className="nc-editor-topbar-left">
        <span className="nc-editor-title">Parotia Editor</span>
        {filename && <span className="nc-editor-filename">{filename}</span>}
        {imageIdentity && <span className="nc-editor-image-identity" title="Decoded image dimensions">{imageIdentity}</span>}
      </div>
      <div className="nc-editor-topbar-right">
        <div className="nc-editor-zoom-controls" role="group" aria-label="Zoom controls">
          <button className="nc-editor-zoom-button" onClick={() => viewportRef.current?.zoomBy(1 / 1.2)} disabled={!loaded || operating || tool === "crop"} title="Zoom out (Ctrl+-)" aria-label="Zoom out"><ZoomOut size={14} /></button>
          <button className="nc-editor-zoom-value" onClick={() => viewportRef.current?.fit()} disabled={!loaded || operating || tool === "crop"} title="Fit to workspace (0)">{viewportState.percent}%</button>
          <button className="nc-editor-zoom-button" onClick={() => viewportRef.current?.zoomBy(1.2)} disabled={!loaded || operating || tool === "crop"} title="Zoom in (Ctrl++)" aria-label="Zoom in"><ZoomIn size={14} /></button>
          <button className={`nc-editor-zoom-mode ${viewportState.mode === "FIT" ? "nc-editor-zoom-mode-active" : ""}`} onClick={() => viewportRef.current?.fit()} disabled={!loaded || operating || tool === "crop"} title="Fit to workspace (0)"><Maximize2 size={13} />Fit</button>
          <button className={`nc-editor-zoom-mode ${viewportState.mode === "FILL" ? "nc-editor-zoom-mode-active" : ""}`} onClick={() => viewportRef.current?.fill()} disabled={!loaded || operating || tool === "crop"} title="Fill workspace">Fill</button>
          <button className={`nc-editor-zoom-mode ${viewportState.mode === "ACTUAL" ? "nc-editor-zoom-mode-active" : ""}`} onClick={() => viewportRef.current?.actualSize()} disabled={!loaded || operating || tool === "crop"} title="Actual pixels (1)">1:1</button>
        </div>
        <span className="nc-editor-separator" />
        <button className="nc-editor-btn nc-editor-btn-ghost" onClick={() => void restoreHistory("undo")} disabled={!canUndo || operating} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={14} /></button>
        <button className="nc-editor-btn nc-editor-btn-ghost" onClick={() => void restoreHistory("redo")} disabled={!canRedo || operating} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={14} /></button>
        <span className="nc-editor-separator" />
        <button className="nc-editor-btn nc-editor-btn-outline" onClick={() => void handleCopy()} disabled={!loaded || operating} title="Copy to clipboard"><Copy size={14} /></button>
        {canShare && <button className="nc-editor-btn nc-editor-btn-outline" onClick={() => void handleShare()} disabled={!loaded || operating} title="Share"><Share2 size={14} /></button>}
        <button className="nc-editor-btn nc-editor-btn-primary" onClick={() => void handleDownload()} disabled={!loaded || saving || operating || saved}><Download size={14} />{saving ? "Saving…" : saved ? "Saved" : "Save"}</button>
        <button className="nc-editor-btn nc-editor-btn-close" onClick={() => void handleClose()} disabled={operating} title="Close" aria-label="Close"><X size={16} /></button>
      </div>
    </div>
    <div className="nc-editor-canvas-area" ref={wrapperRef}>
      {!loaded && <div className="nc-editor-loading">{error ?? "Loading image…"}</div>}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div ref={konvaContainerRef} className="nc-editor-konva-container" style={{ display: loaded ? "block" : "none", pointerEvents: operating ? "none" : "auto" }} />
      {error && loaded && <div className="nc-editor-error" role="alert">{error}</div>}
    </div>
    {loaded && <div className="nc-editor-toolbar">
      <ToolButton icon={<Scissors size={15} />} label="Crop" active={tool === "crop"} disabled={operating} onClick={() => setTool(tool === "crop" ? null : "crop")} />
      <ToolButton icon={<Pencil size={15} />} label="Draw" active={tool === "annotate"} disabled={operating} onClick={() => setTool(tool === "annotate" ? null : "annotate")} />
      <ToolButton icon={<SlidersHorizontal size={15} />} label="Adjust" active={tool === "adjust"} disabled={operating} onClick={() => setTool(tool === "adjust" ? null : "adjust")} />
      {tool === "annotate" && <div className="nc-editor-tool-options"><ShapePicker kind={shapeKind} onChange={setShapeKind} /><label>Color<input type="color" value={drawColor} onChange={(event) => setDrawColor(event.target.value)} /></label><label>Width<input type="range" min={1} max={20} value={drawWidth} onChange={(event) => setDrawWidth(Number(event.target.value))} /></label>{shapeKind === "text" && <label>Size<input type="range" min={12} max={72} value={textSize} onChange={(event) => setTextSize(Number(event.target.value))} /></label>}</div>}
    </div>}
  </div>;
}

function ToolButton({ icon, label, active, disabled, onClick }: { icon: React.ReactNode; label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return <button className={`nc-editor-tool-btn ${active ? "nc-editor-tool-btn-active" : ""}`} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>;
}

const SHAPE_OPTIONS: { kind: AnnotateTool; icon: React.ReactNode; tip: string }[] = [
  { kind: "freehand", icon: <Pencil size={13} />, tip: "Freehand" }, { kind: "line", icon: <Minus size={13} />, tip: "Line" },
  { kind: "rect", icon: <Square size={13} />, tip: "Rectangle" }, { kind: "ellipse", icon: <Circle size={13} />, tip: "Ellipse" },
  { kind: "arrow", icon: <ArrowRight size={13} />, tip: "Arrow" }, { kind: "text", icon: <Type size={13} />, tip: "Text" },
];

function ShapePicker({ kind, onChange }: { kind: AnnotateTool; onChange: (kind: AnnotateTool) => void }) {
  return <div className="nc-editor-shape-picker">{SHAPE_OPTIONS.map((option) => <button key={option.kind} className={`nc-editor-shape-btn ${kind === option.kind ? "nc-editor-shape-btn-active" : ""}`} title={option.tip} onClick={() => onChange(option.kind)}>{option.icon}</button>)}</div>;
}
