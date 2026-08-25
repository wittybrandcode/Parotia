import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Circle, Copy, Download, Magnet, Maximize2, MessageSquare, Minus, MousePointer2, Pencil, Redo2, Scissors, Share2, SlidersHorizontal, Square, Type, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { createCanvasEngine, type CanvasEngine } from "./CanvasEngine";
import { createCropTool, type CropRect, type CropTool } from "./CropTool";
import { createAnnotationLayer, type AnnotationLayer, type AnnotateTool } from "./AnnotationLayer";
import { createAdjustPanel, type AdjustPanel } from "./AdjustPanel";
import { createEditorDocument, createLayerBase, parseEditorDocument, type EditorDocument, type EditorLayer } from "./EditorDocument";
import { addLayerCommand, EditorDocumentHistory, reorderLayersCommand, replaceDocumentCommand, replaceLayerCollectionCommand, replaceLayerCommand, replaceLayersCommand } from "./EditorDocumentHistory";
import { alignLayers, cloneLayers, distributeLayers, groupLayers, translateLayer, ungroupLayers, type LayerAlignment, type LayerDistribution } from "./EditorLayerOperations";
import { createEditorViewport, type EditorViewport, type ViewportState } from "./EditorViewport";
import { LayerPanel } from "./LayerPanel";
import {
  assessEditorImage,
  detectedDeviceMemoryGb,
  editorBypassWarning,
  formatEditorImageIdentity,
} from "@shared/utils/editorPreflight";

type ActiveTool = "select" | "annotate" | "crop" | "adjust";
type EditorParams = { imageKey?: string; filename?: string; editorToken?: string; parentOrigin?: string };
const canShare = typeof navigator !== "undefined" && "share" in navigator;
const LAYER_CLIPBOARD_MAX_CHARS = 64 * 1024 * 1024;

function selectAnnotationLayers(annotation: AnnotationLayer | null, layerIds: string[]): void {
  if (!annotation) return;
  const compatible = annotation as AnnotationLayer & { selectLayers?: (ids: string[]) => void; selectLayer?: (id: string | null) => void };
  if (typeof compatible.selectLayers === "function") compatible.selectLayers(layerIds);
  else compatible.selectLayer?.(layerIds[0] ?? null);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Failed to encode PNG")), "image/png"));
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Failed to read the image layer"));
    reader.onerror = () => reject(new Error("Failed to read the image layer"));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
      ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
      : reject(new Error("The image layer has invalid dimensions"));
    image.onerror = () => reject(new Error("Failed to decode the image layer"));
    image.src = source;
  });
}

export function EditorApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const konvaContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const annotationRef = useRef<AnnotationLayer | null>(null);
  const cropRef = useRef<CropTool | null>(null);
  const adjustRef = useRef<AdjustPanel | null>(null);
  const viewportRef = useRef<EditorViewport | null>(null);
  const paramsRef = useRef<EditorParams>({});
  const operationRef = useRef(false);
  const historyRef = useRef<EditorDocumentHistory | null>(null);
  const layerSyncRef = useRef(Promise.resolve());
  const selectedLayerIdsRef = useRef<string[]>([]);
  const layerClipboardRef = useRef<EditorLayer[]>([]);

  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<ActiveTool>("select");
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
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  const [documentState, setDocumentState] = useState<EditorDocument | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [viewportState, setViewportState] = useState<ViewportState>({ scale: 1, percent: 100, mode: "FIT", offsetX: 0, offsetY: 0 });

  const refreshHistory = useCallback(() => {
    setCanUndo(historyRef.current?.canUndo ?? false);
    setCanRedo(historyRef.current?.canRedo ?? false);
  }, []);

  const setSelection = useCallback((value: string[] | string | null): void => {
    const layerIds = [...new Set(Array.isArray(value) ? value : value ? [value] : [])];
    selectedLayerIdsRef.current = layerIds;
    setSelectedLayerIds(layerIds);
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
    annotation.setSnapping(snappingEnabled);
    annotationRef.current = annotation;
    await annotation.loadLayers(document.layers);
    setDocumentState(document);
    viewportRef.current = createEditorViewport(wrapper, container, document.canvas.width, document.canvas.height, { onChange: setViewportState });
    annotation.setCommitListener((layer) => {
      if (operationRef.current) return;
      try {
        const history = historyRef.current;
        if (!history) throw new Error("Editor document history is unavailable");
        const nextDocument = history.execute(addLayerCommand(layer));
        setDocumentState(nextDocument);
        setSelection(layer.id);
        selectAnnotationLayers(annotation, [layer.id]);
        setSaved(false);
        refreshHistory();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to record the annotation layer");
      }
    });
    annotation.setSelectionListener(setSelection);
    annotation.setTransformListener((before, after) => {
      try {
        const history = historyRef.current;
        if (!history) throw new Error("Editor document history is unavailable");
        const current = before.map((entry) => history.document.layers.find((layer) => layer.id === entry.id)).filter((entry): entry is EditorLayer => Boolean(entry));
        if (current.length !== before.length) throw new Error("A transformed layer no longer exists");
        const transformed = current.map((entry, index) => ({ ...entry, transform: after[index]!.transform } as EditorLayer));
        if (current.every((entry, index) => JSON.stringify(entry.transform) === JSON.stringify(transformed[index]!.transform))) return;
        const nextDocument = history.execute(replaceLayersCommand(current, transformed, `Transform ${current.length} layer${current.length === 1 ? "" : "s"}`));
        setDocumentState(nextDocument);
        setSelection(transformed.map((entry) => entry.id));
        setSaved(false);
        refreshHistory();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to transform the layer");
      }
    });
    const selection = selectedLayerIdsRef.current.filter((id) => document.layers.some((layer) => layer.id === id));
    selectAnnotationLayers(annotation, selection);
    setSelection(selection);
    cropRef.current?.stop();
    adjustRef.current?.stop();
    cropRef.current = createCropTool(container, wrapper, document.canvas.width, document.canvas.height);
    adjustRef.current = createAdjustPanel(container, wrapper);
    refreshHistory();
  }, [drawColor, drawWidth, textSize, shapeKind, snappingEnabled, refreshHistory, setSelection]);

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

  const syncLayers = useCallback((document: EditorDocument, selection: string[]): void => {
    layerSyncRef.current = layerSyncRef.current.then(async () => {
      const annotation = annotationRef.current;
      if (!annotation) return;
      await annotation.replaceLayers(document.layers);
      selectAnnotationLayers(annotation, selection);
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Failed to refresh editor layers");
    });
  }, []);

  const handleSelectLayers = useCallback((layerIds: string[]): void => {
    setTool("select");
    setSelection(layerIds);
    annotationRef.current?.setMode("select");
    selectAnnotationLayers(annotationRef.current, layerIds);
  }, [setSelection]);

  const handleUpdateLayer = useCallback((after: EditorLayer, label: string): void => {
    const history = historyRef.current;
    if (!history || operating) return;
    const before = history.document.layers.find((layer) => layer.id === after.id);
    if (!before || JSON.stringify(before) === JSON.stringify(after)) return;
    try {
      const nextDocument = history.execute(replaceLayerCommand(before, after, label));
      setDocumentState(nextDocument);
      setSelection(after.id);
      setSaved(false);
      refreshHistory();
      syncLayers(nextDocument, [after.id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update the layer");
    }
  }, [operating, refreshHistory, setSelection, syncLayers]);

  const handleDeleteLayers = useCallback((layerIds: string[]): void => {
    const history = historyRef.current;
    if (!history || operating) return;
    try {
      const selected = new Set(layerIds);
      const after = history.document.layers.filter((layer) => !selected.has(layer.id));
      if (after.length === history.document.layers.length) return;
      const nextDocument = history.execute(replaceLayerCollectionCommand(history.document.layers, after, `Delete ${layerIds.length} layer${layerIds.length === 1 ? "" : "s"}`));
      setDocumentState(nextDocument);
      setSelection(null);
      setSaved(false);
      refreshHistory();
      syncLayers(nextDocument, []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete the layer");
    }
  }, [operating, refreshHistory, setSelection, syncLayers]);

  const handleDuplicateLayers = useCallback((layerIds: string[]): void => {
    const history = historyRef.current;
    if (!history || operating) return;
    const selected = new Set(layerIds);
    const source = history.document.layers.filter((layer) => selected.has(layer.id));
    if (!source.length) return;
    const duplicates = cloneLayers(source).map((layer, index) => ({ ...layer, order: history.document.layers.length + index }));
    const nextDocument = history.execute(replaceLayerCollectionCommand(history.document.layers, [...history.document.layers, ...duplicates], `Duplicate ${source.length} layer${source.length === 1 ? "" : "s"}`));
    setDocumentState(nextDocument);
    setSelection(duplicates.map((layer) => layer.id));
    setSaved(false);
    refreshHistory();
    syncLayers(nextDocument, duplicates.map((layer) => layer.id));
  }, [operating, refreshHistory, setSelection, syncLayers]);

  const handleMoveLayer = useCallback((layerId: string, direction: -1 | 1): void => {
    const history = historyRef.current;
    if (!history || operating) return;
    const before = history.document.layers.map((layer) => layer.id);
    const index = before.indexOf(layerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= before.length) return;
    const after = [...before];
    [after[index], after[target]] = [after[target]!, after[index]!];
    const nextDocument = history.execute(reorderLayersCommand(before, after));
    setDocumentState(nextDocument);
    setSelection([layerId]);
    setSaved(false);
    refreshHistory();
    syncLayers(nextDocument, [layerId]);
  }, [operating, refreshHistory, setSelection, syncLayers]);

  const handleReorderLayers = useCallback((after: string[]): void => {
    const history = historyRef.current;
    if (!history || operating) return;
    const before = history.document.layers.map((layer) => layer.id);
    if (before.length !== after.length || before.every((id, index) => id === after[index])) return;
    try {
      const nextDocument = history.execute(reorderLayersCommand(before, after));
      const selection = selectedLayerIdsRef.current;
      setDocumentState(nextDocument);
      setSaved(false);
      refreshHistory();
      syncLayers(nextDocument, selection);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to reorder the layers");
    }
  }, [operating, refreshHistory, syncLayers]);

  const handleGroupLayers = useCallback((): void => {
    const history = historyRef.current;
    const selection = selectedLayerIdsRef.current;
    if (!history || operating || selection.length < 2) return;
    try {
      const result = groupLayers(history.document.layers, selection);
      const nextDocument = history.execute(replaceLayerCollectionCommand(history.document.layers, result.layers, "Group layers"));
      setDocumentState(nextDocument);
      setSelection([result.group.id]);
      setSaved(false);
      refreshHistory();
      syncLayers(nextDocument, [result.group.id]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to group layers"); }
  }, [operating, refreshHistory, setSelection, syncLayers]);

  const handleUngroupLayers = useCallback((): void => {
    const history = historyRef.current;
    const selection = selectedLayerIdsRef.current;
    if (!history || operating || !selection.some((id) => history.document.layers.find((layer) => layer.id === id)?.kind === "group")) return;
    try {
      const result = ungroupLayers(history.document.layers, selection);
      const nextDocument = history.execute(replaceLayerCollectionCommand(history.document.layers, result.layers, "Ungroup layers"));
      setDocumentState(nextDocument);
      setSelection(result.selection);
      setSaved(false);
      refreshHistory();
      syncLayers(nextDocument, result.selection);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Failed to ungroup layers"); }
  }, [operating, refreshHistory, setSelection, syncLayers]);

  const handleAlignLayers = useCallback((alignment: LayerAlignment): void => {
    const history = historyRef.current;
    const selection = selectedLayerIdsRef.current;
    if (!history || operating || selection.length < 2) return;
    const selected = new Set(selection);
    const before = history.document.layers.filter((layer) => selected.has(layer.id) && !layer.locked);
    if (before.length < 2) return;
    const after = alignLayers(before, alignment);
    const nextDocument = history.execute(replaceLayersCommand(before, after, `Align layers ${alignment}`));
    setDocumentState(nextDocument); setSaved(false); refreshHistory(); syncLayers(nextDocument, selection);
  }, [operating, refreshHistory, syncLayers]);

  const handleDistributeLayers = useCallback((direction: LayerDistribution): void => {
    const history = historyRef.current;
    const selection = selectedLayerIdsRef.current;
    if (!history || operating || selection.length < 3) return;
    const selected = new Set(selection);
    const before = history.document.layers.filter((layer) => selected.has(layer.id) && !layer.locked);
    if (before.length < 3) return;
    const after = distributeLayers(before, direction);
    const nextDocument = history.execute(replaceLayersCommand(before, after, `Distribute layers ${direction}`));
    setDocumentState(nextDocument); setSaved(false); refreshHistory(); syncLayers(nextDocument, selection);
  }, [operating, refreshHistory, syncLayers]);

  const handleCopyLayers = useCallback(async (): Promise<void> => {
    const document = historyRef.current?.document;
    if (!document) return;
    const selected = new Set(selectedLayerIdsRef.current);
    const layers = document.layers.filter((layer) => selected.has(layer.id));
    if (!layers.length) return;
    layerClipboardRef.current = layers;
    try {
      const payload = JSON.stringify({ schema: "parotia.editor-layers", version: 1, layers });
      if (payload.length <= LAYER_CLIPBOARD_MAX_CHARS) await navigator.clipboard.writeText(payload);
    } catch {
      // The in-memory clipboard remains available when the browser denies text clipboard access.
    }
  }, []);

  const handlePasteLayers = useCallback(async (): Promise<void> => {
    const history = historyRef.current;
    if (!history || operating) return;
    let source = layerClipboardRef.current;
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText.length > LAYER_CLIPBOARD_MAX_CHARS) throw new Error("Layer clipboard payload is too large");
      const value = JSON.parse(clipboardText) as { schema?: unknown; version?: unknown; layers?: unknown };
      if (value.schema === "parotia.editor-layers" && value.version === 1 && Array.isArray(value.layers)) {
        // Clipboard payloads have their own v1 schema and may contain text layers
        // copied by an older editor. Route them through the v2 -> current migration.
        source = parseEditorDocument({ ...history.document, version: 2, layers: value.layers }).layers;
      }
    } catch {
      // Fall back to the editor's internal clipboard.
    }
    if (!source.length) return;
    const copies = cloneLayers(source).map((layer, index) => ({ ...layer, order: history.document.layers.length + index }));
    const nextDocument = history.execute(replaceLayerCollectionCommand(history.document.layers, [...history.document.layers, ...copies], `Paste ${copies.length} layer${copies.length === 1 ? "" : "s"}`));
    const selection = copies.map((layer) => layer.id);
    setDocumentState(nextDocument); setSelection(selection); setSaved(false); refreshHistory(); syncLayers(nextDocument, selection);
  }, [operating, refreshHistory, setSelection, syncLayers]);

  const nudgeSelectedLayers = useCallback((x: number, y: number): void => {
    const history = historyRef.current;
    const selection = selectedLayerIdsRef.current;
    if (!history || operating || !selection.length) return;
    const selected = new Set(selection);
    const before = history.document.layers.filter((layer) => selected.has(layer.id) && !layer.locked);
    if (!before.length) return;
    const after = before.map((layer) => translateLayer(layer, x, y));
    const nextDocument = history.execute(replaceLayersCommand(before, after, "Nudge layers"));
    setDocumentState(nextDocument); setSaved(false); refreshHistory(); syncLayers(nextDocument, selection);
  }, [operating, refreshHistory, syncLayers]);

  const handleImageFile = useCallback(async (file: File | undefined): Promise<void> => {
    if (!file) return;
    await runExclusive(async () => {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Please choose a PNG, JPEG, WebP, or GIF image");
      if (file.size > 32 * 1024 * 1024) throw new Error("Image layers are limited to 32 MB");
      const source = await fileAsDataUrl(file);
      const dimensions = await imageDimensions(source);
      if (dimensions.width > 16_384 || dimensions.height > 16_384 || dimensions.width * dimensions.height > 32 * 1024 * 1024) throw new Error("The image layer exceeds the safe editor limits");
      const history = historyRef.current;
      if (!history) throw new Error("Editor document history is unavailable");
      const document = history.document;
      const scale = Math.min(1, (document.canvas.width * 0.5) / dimensions.width, (document.canvas.height * 0.5) / dimensions.height);
      const base = createLayerBase("image", document.layers.length, (document.canvas.width - dimensions.width * scale) / 2, (document.canvas.height - dimensions.height * scale) / 2);
      const layer: EditorLayer = { ...base, kind: "image", source, width: dimensions.width, height: dimensions.height, transform: { ...base.transform, scaleX: scale, scaleY: scale } };
      const nextDocument = history.execute(addLayerCommand(layer));
      setDocumentState(nextDocument);
      setSelection(layer.id);
      setTool("select");
      setSaved(false);
      refreshHistory();
      await annotationRef.current?.replaceLayers(nextDocument.layers);
      annotationRef.current?.setMode("select");
      selectAnnotationLayers(annotationRef.current, [layer.id]);
    });
  }, [refreshHistory, runExclusive, setSelection]);

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
      setSelection(null);
      await initAnnotation(after);
      setTool("select");
      refreshHistory();
    });
  }, [initAnnotation, refreshHistory, renderEditor, runExclusive, setSelection]);

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
        setSelection(null);
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
  }, [initAnnotation, refreshHistory, runExclusive, setSelection]);

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
    annotationRef.current?.setSnapping(snappingEnabled);
  }, [snappingEnabled]);

  useEffect(() => {
    cropRef.current?.stop();
    adjustRef.current?.stop();
    const annotation = annotationRef.current;
    if (!loaded || !annotation) return;
    annotation.setMode(tool === "annotate" ? "draw" : tool === "select" ? "select" : "idle");
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
      }, () => setTool("select"));
    }
    if (tool === "adjust" && adjustRef.current) {
      adjustRef.current.start(() => {
        const filter = adjustRef.current?.getFilter() ?? "none";
        const surface = konvaContainerRef.current;
        if (surface) surface.style.filter = "";
        void commitRenderedImage("Adjust image", (engine) => {
          engine.applyFilter(filter);
        });
      }, () => setTool("select"));
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
      else if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const selection = historyRef.current?.document.layers.map((layer) => layer.id) ?? [];
        setTool("select"); setSelection(selection); selectAnnotationLayers(annotationRef.current, selection);
      }
      else if (modifier && event.key.toLowerCase() === "g" && event.shiftKey) { event.preventDefault(); handleUngroupLayers(); }
      else if (modifier && event.key.toLowerCase() === "g") { event.preventDefault(); handleGroupLayers(); }
      else if (modifier && event.key.toLowerCase() === "c" && selectedLayerIdsRef.current.length) { event.preventDefault(); void handleCopyLayers(); }
      else if (modifier && event.key.toLowerCase() === "v") { event.preventDefault(); void handlePasteLayers(); }
      else if (modifier && event.key.toLowerCase() === "d" && selectedLayerIdsRef.current.length) { event.preventDefault(); handleDuplicateLayers(selectedLayerIdsRef.current); }
      else if (modifier && (event.key === "+" || event.key === "=")) { event.preventDefault(); viewportRef.current?.zoomBy(1.2); }
      else if (modifier && event.key === "-") { event.preventDefault(); viewportRef.current?.zoomBy(1 / 1.2); }
      else if (event.key === "0") { event.preventDefault(); viewportRef.current?.fit(); }
      else if (event.key === "1") { event.preventDefault(); viewportRef.current?.actualSize(); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedLayerIdsRef.current.length) { event.preventDefault(); handleDeleteLayers(selectedLayerIdsRef.current); }
      else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedLayerIdsRef.current.length) {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        nudgeSelectedLayers(event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0, event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0);
      }
      else if (event.key === "Escape") { setTool("select"); selectAnnotationLayers(annotationRef.current, []); setSelection(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCopyLayers, handleDeleteLayers, handleDuplicateLayers, handleGroupLayers, handlePasteLayers, handleUngroupLayers, nudgeSelectedLayers, restoreHistory, setSelection]);

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
    <div className="nc-editor-workspace">
      <div className="nc-editor-canvas-area" ref={wrapperRef}>
        {!loaded && <div className="nc-editor-loading">{error ?? "Loading image…"}</div>}
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div ref={konvaContainerRef} className="nc-editor-konva-container" style={{ display: loaded ? "block" : "none", pointerEvents: operating ? "none" : "auto" }} />
        {error && loaded && <div className="nc-editor-error" role="alert">{error}</div>}
      </div>
      {loaded && documentState && <LayerPanel document={documentState} selectedLayerIds={selectedLayerIds} disabled={operating}
        onSelect={handleSelectLayers} onUpdate={handleUpdateLayer} onDelete={handleDeleteLayers}
        onDuplicate={handleDuplicateLayers} onMove={handleMoveLayer} onReorder={handleReorderLayers}
        onGroup={handleGroupLayers} onUngroup={handleUngroupLayers} onAlign={handleAlignLayers} onDistribute={handleDistributeLayers}
        onCopy={() => void handleCopyLayers()} onPaste={() => void handlePasteLayers()} onAddImage={() => imageInputRef.current?.click()} />}
    </div>
    <input ref={imageInputRef} className="nc-editor-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      void handleImageFile(file);
    }} />
    {loaded && <div className="nc-editor-toolbar">
      <ToolButton icon={<MousePointer2 size={15} />} label="Select" active={tool === "select"} disabled={operating} onClick={() => setTool("select")} />
      <ToolButton icon={<Scissors size={15} />} label="Crop" active={tool === "crop"} disabled={operating} onClick={() => setTool(tool === "crop" ? "select" : "crop")} />
      <ToolButton icon={<Pencil size={15} />} label="Draw" active={tool === "annotate"} disabled={operating} onClick={() => setTool(tool === "annotate" ? "select" : "annotate")} />
      <ToolButton icon={<SlidersHorizontal size={15} />} label="Adjust" active={tool === "adjust"} disabled={operating} onClick={() => setTool(tool === "adjust" ? "select" : "adjust")} />
      <ToolButton icon={<Magnet size={15} />} label="Snap" title="Snap to canvas and layers (hold Alt while dragging to bypass)" active={snappingEnabled} disabled={operating} onClick={() => setSnappingEnabled((enabled) => !enabled)} />
      <div className="nc-editor-tool-options">
        <ShapePicker kind={shapeKind} disabled={operating} onChange={(kind) => { setShapeKind(kind); setTool("annotate"); }} />
        <label>Color<input aria-label="Drawing color" type="color" value={drawColor} disabled={operating} onChange={(event) => setDrawColor(event.target.value)} /></label>
        <label>Width<input aria-label="Drawing width" type="range" min={1} max={20} value={drawWidth} disabled={operating} onChange={(event) => setDrawWidth(Number(event.target.value))} /></label>
        <label>Size<input aria-label="Text size" type="range" min={12} max={72} value={textSize} disabled={operating} onChange={(event) => setTextSize(Number(event.target.value))} /></label>
      </div>
    </div>}
  </div>;
}

function ToolButton({ icon, label, title, active, disabled, onClick }: { icon: React.ReactNode; label: string; title?: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return <button className={`nc-editor-tool-btn ${active ? "nc-editor-tool-btn-active" : ""}`} aria-pressed={active} title={title} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>;
}

const SHAPE_OPTIONS: { kind: AnnotateTool; icon: React.ReactNode; tip: string }[] = [
  { kind: "freehand", icon: <Pencil size={13} />, tip: "Freehand" }, { kind: "line", icon: <Minus size={13} />, tip: "Line" },
  { kind: "rect", icon: <Square size={13} />, tip: "Rectangle" }, { kind: "ellipse", icon: <Circle size={13} />, tip: "Ellipse" },
  { kind: "arrow", icon: <ArrowRight size={13} />, tip: "Arrow" }, { kind: "text", icon: <Type size={13} />, tip: "Text" },
  { kind: "callout", icon: <MessageSquare size={13} />, tip: "Callout" },
];

function ShapePicker({ kind, disabled, onChange }: { kind: AnnotateTool; disabled?: boolean; onChange: (kind: AnnotateTool) => void }) {
  return <div className="nc-editor-shape-picker">{SHAPE_OPTIONS.map((option) => <button key={option.kind} disabled={disabled} className={`nc-editor-shape-btn ${kind === option.kind ? "nc-editor-shape-btn-active" : ""}`} title={option.tip} onClick={() => onChange(option.kind)}>{option.icon}</button>)}</div>;
}
