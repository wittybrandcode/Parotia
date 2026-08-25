import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, Circle, ClipboardPaste, Copy, Eye, EyeOff, GripVertical, Hash, ImagePlus, Layers3, Lock, MessageSquare,
  Minus, Paintbrush, RotateCcw, Square, Trash2, Type, Unlock,
} from "lucide-react";
import type { EditorArrowLayer, EditorDocument, EditorLayer, EditorTextLayer } from "./EditorDocument";
import type { LayerAlignment, LayerDistribution } from "./EditorLayerOperations";
import { isSafeFontFamily, localFontAccessAvailability, queryLocalFontFamilies, SAFE_FONT_FAMILIES } from "./EditorFonts";
import { applyTextPreset, EDITOR_TEXT_PRESETS, type EditorTextPreset } from "./EditorTextPresets";
import { applyShapePreset, EDITOR_SHAPE_PRESETS, isShapeLayer, isStylableLayer, reverseArrow, type EditorShapePreset } from "./EditorShapeStyles";

interface LayerPanelProps {
  document: EditorDocument;
  selectedLayerIds: string[];
  disabled: boolean;
  onSelect(layerIds: string[]): void;
  onUpdate(layer: EditorLayer, label: string): void;
  onDelete(layerIds: string[]): void;
  onDuplicate(layerIds: string[]): void;
  onMove(layerId: string, direction: -1 | 1): void;
  onReorder(layerIds: string[]): void;
  onGroup(): void;
  onUngroup(): void;
  onAlign(alignment: LayerAlignment): void;
  onDistribute(direction: LayerDistribution): void;
  onCopy(): void;
  onPaste(): void;
  onCopyStyle?(layerId: string): void;
  onPasteStyle?(layerIds: string[]): void;
  canPasteStyle?: boolean;
  onAddImage(): void;
}

type DropEdge = "before" | "after";

function safeColor(value: string | null, fallback = "#000000"): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function CommitTextArea({ value, direction, onCommit }: { value: string; direction: "auto" | "ltr" | "rtl"; onCommit(value: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => { if (draft !== value) onCommit(draft); };
  return <textarea aria-label="Layer text" dir={direction} rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); commit(); event.currentTarget.blur(); }
    if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); }
  }} />;
}

function insertionEdge(element: HTMLElement, clientY: number): DropEdge {
  const rect = element.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function layerIcon(kind: EditorLayer["kind"]) {
  switch (kind) {
    case "image": return <ImagePlus size={14} />;
    case "text": return <Type size={14} />;
    case "rectangle": return <Square size={14} />;
    case "ellipse": return <Circle size={14} />;
    case "line": return <Minus size={14} />;
    case "arrow": return <ArrowRight size={14} />;
    case "callout": return <MessageSquare size={14} />;
    case "step": return <Hash size={14} />;
    case "group": return <Layers3 size={14} />;
  }
}

function CommitField({ value, type = "text", step, onCommit, ariaLabel }: {
  value: string | number;
  type?: "text" | "number";
  step?: number;
  onCommit(value: string): void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (): void => {
    if (draft !== String(value)) onCommit(draft);
  };
  return <input aria-label={ariaLabel} type={type} step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
    if (event.key === "Enter") { commit(); event.currentTarget.blur(); }
    if (event.key === "Escape") { setDraft(String(value)); event.currentTarget.blur(); }
  }} />;
}

export function LayerPanel({ document, selectedLayerIds, disabled, onSelect, onUpdate, onDelete, onDuplicate, onMove, onReorder, onGroup, onUngroup, onAlign, onDistribute, onCopy, onPaste, onCopyStyle = () => undefined, onPasteStyle = () => undefined, canPasteStyle = false, onAddImage }: LayerPanelProps) {
  const ordered = [...document.layers].sort((a, b) => b.order - a.order);
  const selectedSet = new Set(selectedLayerIds);
  const selected = selectedLayerIds.length === 1 ? document.layers.find((layer) => layer.id === selectedLayerIds[0]) ?? null : null;
  const selectionAnchor = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: DropEdge } | null>(null);
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [localFontStatus, setLocalFontStatus] = useState<"idle" | "loading" | "ready" | "denied" | "blocked" | "unsupported">(() => {
    const availability = localFontAccessAvailability();
    return availability === "available" ? "idle" : availability === "policy-blocked" ? "blocked" : "unsupported";
  });
  const [localFontError, setLocalFontError] = useState<string | null>(null);
  const update = (next: EditorLayer, label: string): void => onUpdate(next, label);
  const loadLocalFonts = async (): Promise<void> => {
    setLocalFontStatus("loading"); setLocalFontError(null);
    try {
      const families = await queryLocalFontFamilies();
      setLocalFonts(families); setLocalFontStatus("ready");
    } catch (cause) {
      const availability = localFontAccessAvailability();
      setLocalFontStatus(availability === "policy-blocked" ? "blocked" : availability === "unsupported" ? "unsupported" : "denied");
      setLocalFontError(cause instanceof Error ? cause.message : "Local font access was not granted");
    }
  };
  const selectRow = (layerId: string, shiftKey = false, toggle = false): void => {
    if (shiftKey && selectionAnchor.current) {
      const anchor = ordered.findIndex((layer) => layer.id === selectionAnchor.current);
      const current = ordered.findIndex((layer) => layer.id === layerId);
      if (anchor >= 0 && current >= 0) onSelect(ordered.slice(Math.min(anchor, current), Math.max(anchor, current) + 1).map((layer) => layer.id));
      return;
    }
    selectionAnchor.current = layerId;
    onSelect(toggle ? (selectedSet.has(layerId) ? selectedLayerIds.filter((id) => id !== layerId) : [...selectedLayerIds, layerId]) : [layerId]);
  };

  const finishDrag = (): void => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const dropLayer = (sourceId: string, targetId: string, edge: DropEdge): void => {
    if (!sourceId || sourceId === targetId) { finishDrag(); return; }
    const displayed = ordered.map((layer) => layer.id).filter((id) => id !== sourceId);
    const targetIndex = displayed.indexOf(targetId);
    if (targetIndex < 0) { finishDrag(); return; }
    displayed.splice(targetIndex + (edge === "after" ? 1 : 0), 0, sourceId);
    onReorder([...displayed].reverse());
    finishDrag();
  };

  return <aside className="nc-layer-panel" aria-label="Layers panel">
    <div className="nc-layer-panel-header">
      <span><Layers3 size={15} /> Layers <b>{document.layers.length}</b></span>
      <button onClick={onAddImage} disabled={disabled} title="Add image layer" aria-label="Add image layer"><ImagePlus size={15} /></button>
    </div>

    <div className="nc-layer-actions" role="toolbar" aria-label="Layer actions">
      <button onClick={onGroup} disabled={disabled || selectedLayerIds.length < 2 || selectedLayerIds.some((id) => document.layers.find((layer) => layer.id === id)?.locked)} title="Group selected layers (Ctrl+G)">Group</button>
      <button onClick={onUngroup} disabled={disabled
        || !selectedLayerIds.some((id) => document.layers.find((layer) => layer.id === id)?.kind === "group")
        || selectedLayerIds.some((id) => { const layer = document.layers.find((entry) => entry.id === id); return layer?.kind === "group" && layer.locked; })}
      title="Ungroup selected groups (Ctrl+Shift+G)">Ungroup</button>
      <button onClick={onCopy} disabled={disabled || !selectedLayerIds.length} title="Copy selected layers (Ctrl+C)"><Copy size={13} /></button>
      <button onClick={onPaste} disabled={disabled} title="Paste layers (Ctrl+V)">Paste</button>
      <button onClick={() => selected && onCopyStyle(selected.id)} disabled={disabled || !selected || !isStylableLayer(selected)} title="Copy layer style (Ctrl+Alt+C)" aria-label="Copy layer style"><Paintbrush size={13} /></button>
      <button onClick={() => onPasteStyle(selectedLayerIds)} disabled={disabled || !canPasteStyle || !selectedLayerIds.length} title="Paste layer style (Ctrl+Alt+V)" aria-label="Paste layer style"><ClipboardPaste size={13} /></button>
      <button onClick={() => onDuplicate(selectedLayerIds)} disabled={disabled || !selectedLayerIds.length} title="Duplicate selected layers (Ctrl+D)">Duplicate</button>
      <button className="nc-layer-danger" onClick={() => onDelete(selectedLayerIds)} disabled={disabled || !selectedLayerIds.length} title="Delete selected layers"><Trash2 size={13} /></button>
    </div>

    {selectedLayerIds.length >= 2 && <div className="nc-layer-arrange" role="toolbar" aria-label="Align and distribute selected layers">
      <span>Align</span>
      <button onClick={() => onAlign("left")} title="Align left" aria-label="Align left">L</button>
      <button onClick={() => onAlign("horizontal-center")} title="Align horizontal centers" aria-label="Align horizontal centers">↔</button>
      <button onClick={() => onAlign("right")} title="Align right" aria-label="Align right">R</button>
      <button onClick={() => onAlign("top")} title="Align top" aria-label="Align top">T</button>
      <button onClick={() => onAlign("vertical-center")} title="Align vertical centers" aria-label="Align vertical centers">↕</button>
      <button onClick={() => onAlign("bottom")} title="Align bottom" aria-label="Align bottom">B</button>
      <button onClick={() => onDistribute("horizontal")} disabled={selectedLayerIds.length < 3} title="Distribute horizontally" aria-label="Distribute horizontally">⇆</button>
      <button onClick={() => onDistribute("vertical")} disabled={selectedLayerIds.length < 3} title="Distribute vertically" aria-label="Distribute vertically">⇅</button>
    </div>}

    <div className="nc-layer-list" role="listbox" aria-label="Document layers" aria-multiselectable="true">
      {ordered.length === 0 && <div className="nc-layer-empty">Draw a shape, add text, or import an image to create the first editable layer.</div>}
      {ordered.map((layer) => <div
        key={layer.id}
        className={`nc-layer-row ${selectedSet.has(layer.id) ? "nc-layer-row-selected" : ""} ${!layer.visible ? "nc-layer-row-hidden" : ""} ${draggingId === layer.id ? "nc-layer-row-dragging" : ""} ${dropTarget?.id === layer.id ? `nc-layer-drop-${dropTarget.edge}` : ""}`}
        role="option"
        aria-selected={selectedSet.has(layer.id)}
        aria-grabbed={draggingId === layer.id}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        tabIndex={0}
        draggable={!disabled}
        onClick={(event) => selectRow(layer.id, event.shiftKey, event.ctrlKey || event.metaKey)}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); onMove(layer.id, 1); }
          else if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); onMove(layer.id, -1); }
          else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRow(layer.id, event.shiftKey, event.ctrlKey || event.metaKey); }
        }}
        onDragStart={(event) => {
          if (disabled || (event.target as HTMLElement).closest("button")) { event.preventDefault(); return; }
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", layer.id);
          setDraggingId(layer.id);
          setDropTarget(null);
          if (!selectedSet.has(layer.id)) selectRow(layer.id);
        }}
        onDragOver={(event) => {
          const sourceId = draggingId || event.dataTransfer.getData("text/plain");
          if (!sourceId || sourceId === layer.id) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const edge = insertionEdge(event.currentTarget, event.clientY);
          setDropTarget({ id: layer.id, edge });
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceId = draggingId || event.dataTransfer.getData("text/plain");
          const edge = insertionEdge(event.currentTarget, event.clientY);
          dropLayer(sourceId, layer.id, edge);
        }}
        onDragEnd={finishDrag}
      >
        <span className="nc-layer-grip" title="Drag to reorder"><GripVertical size={13} /></span>
        <span className="nc-layer-kind">{layerIcon(layer.kind)}</span>
        <span className="nc-layer-name" title={layer.name}>{layer.name}</span>
        <button onClick={(event) => { event.stopPropagation(); update({ ...layer, visible: !layer.visible }, `${layer.visible ? "Hide" : "Show"} ${layer.name}`); }} disabled={disabled} title={layer.visible ? "Hide layer" : "Show layer"} aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
        <button onClick={(event) => { event.stopPropagation(); update({ ...layer, locked: !layer.locked }, `${layer.locked ? "Unlock" : "Lock"} ${layer.name}`); }} disabled={disabled} title={layer.locked ? "Unlock layer" : "Lock layer"} aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}>{layer.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
      </div>)}
    </div>

    {selected ? <div className="nc-layer-properties">
      <div className="nc-layer-properties-title">
        <span>{layerIcon(selected.kind)} Properties</span>
        <div>
          <button onClick={() => onMove(selected.id, 1)} disabled={disabled || selected.order >= document.layers.length - 1} title="Move layer up" aria-label="Move layer up"><ArrowUp size={13} /></button>
          <button onClick={() => onMove(selected.id, -1)} disabled={disabled || selected.order <= 0} title="Move layer down" aria-label="Move layer down"><ArrowDown size={13} /></button>
          <button onClick={() => onDuplicate([selected.id])} disabled={disabled} title="Duplicate layer" aria-label="Duplicate layer"><Copy size={13} /></button>
          <button className="nc-layer-danger" onClick={() => onDelete([selected.id])} disabled={disabled} title="Delete layer" aria-label="Delete layer"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="nc-layer-identity"><span>{selected.kind}</span><code title={selected.id}>{selected.id}</code></div>

      <label>Name<CommitField ariaLabel="Layer name" value={selected.name} onCommit={(name) => name.trim() && update({ ...selected, name: name.trim() }, `Rename ${selected.name}`)} /></label>
      <label>Opacity <span>{Math.round(selected.opacity * 100)}%</span><input aria-label="Layer opacity" type="range" min={0} max={100} value={Math.round(selected.opacity * 100)} onChange={(event) => update({ ...selected, opacity: Number(event.target.value) / 100 }, `Change ${selected.name} opacity`)} /></label>

      <div className="nc-layer-property-grid">
        <label>X<CommitField ariaLabel="Layer X" type="number" step={1} value={Math.round(selected.transform.x * 100) / 100} onCommit={(value) => updateTransform(selected, "x", value, update)} /></label>
        <label>Y<CommitField ariaLabel="Layer Y" type="number" step={1} value={Math.round(selected.transform.y * 100) / 100} onCommit={(value) => updateTransform(selected, "y", value, update)} /></label>
        <label>Scale X<CommitField ariaLabel="Layer scale X" type="number" step={0.05} value={Math.round(selected.transform.scaleX * 100) / 100} onCommit={(value) => updateTransform(selected, "scaleX", value, update)} /></label>
        <label>Scale Y<CommitField ariaLabel="Layer scale Y" type="number" step={0.05} value={Math.round(selected.transform.scaleY * 100) / 100} onCommit={(value) => updateTransform(selected, "scaleY", value, update)} /></label>
        <label>Rotation<CommitField ariaLabel="Layer rotation" type="number" step={1} value={Math.round(selected.transform.rotation * 100) / 100} onCommit={(value) => updateTransform(selected, "rotation", value, update)} /></label>
      </div>

      {selected.kind === "text" && <>
        <label>Text<CommitTextArea value={selected.text} direction={selected.direction} onCommit={(text) => update({ ...selected, text }, `Edit ${selected.name} text`)} /></label>

        <div className="nc-layer-section-title">Typography</div>
        <label>Preset<select aria-label="Text preset" defaultValue="" onChange={(event) => {
          if (!event.target.value) return;
          update(applyTextPreset(selected, event.target.value as EditorTextPreset["id"]), `Apply ${event.target.value} text preset`);
          event.currentTarget.value = "";
        }}><option value="">Custom…</option>{EDITOR_TEXT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        <label>Font<select aria-label="Layer font" value={selected.fontFamily} onChange={(event) => update({ ...selected, fontFamily: event.target.value }, `Change ${selected.name} font`)}>
          {!([...SAFE_FONT_FAMILIES, ...localFonts] as string[]).includes(selected.fontFamily) && <option value={selected.fontFamily}>{selected.fontFamily} (project)</option>}
          <optgroup label="Safe fonts">{SAFE_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</optgroup>
          {localFonts.length > 0 && <optgroup label="Local fonts">{localFonts.map((font) => <option key={font} value={font}>{font}</option>)}</optgroup>}
        </select></label>
        <div className="nc-layer-font-access">
          <button onClick={() => void loadLocalFonts()} disabled={disabled || localFontStatus === "loading" || localFontStatus === "unsupported" || localFontStatus === "blocked"}>{localFontStatus === "loading" ? "Reading fonts…" : localFontStatus === "ready" ? "Refresh local fonts" : "Load local fonts"}</button>
          <span>{localFontStatus === "ready" ? `${localFonts.length} families` : localFontStatus === "unsupported" ? "Not supported by this browser" : localFontStatus === "blocked" ? "Blocked by this page" : localFontStatus === "denied" ? "Permission not granted" : "Requires your permission"}</span>
        </div>
        {localFontError && <div className="nc-layer-font-warning" role="status">{localFontError}</div>}
        {!isSafeFontFamily(selected.fontFamily) && !localFonts.includes(selected.fontFamily) && <div className="nc-layer-font-warning" role="status">
          {localFontStatus === "ready" ? `“${selected.fontFamily}” is unavailable.` : `“${selected.fontFamily}” has not been verified on this device.`} The saved {selected.fontFallback} fallback will be used if needed.
        </div>}
        <label>Fallback<select aria-label="Font fallback" value={selected.fontFallback} onChange={(event) => update({ ...selected, fontFallback: event.target.value as typeof selected.fontFallback }, `Change ${selected.name} fallback`)}>
          <option value="sans-serif">Sans serif</option><option value="serif">Serif</option><option value="monospace">Monospace</option>
        </select></label>
        <label>Font size<CommitField ariaLabel="Layer font size" type="number" step={1} value={selected.fontSize} onCommit={(value) => {
          const size = Number(value); if (Number.isFinite(size) && size > 0) update({ ...selected, fontSize: size }, `Resize ${selected.name} text`);
        }} /></label>
        <div className="nc-layer-segmented" role="group" aria-label="Text style">
          <button aria-pressed={selected.fontWeight >= 600} className={selected.fontWeight >= 600 ? "active" : ""} onClick={() => update({ ...selected, fontWeight: selected.fontWeight >= 600 ? 400 : 700 }, `Change ${selected.name} weight`)}>B</button>
          <button aria-pressed={selected.fontStyle === "italic"} className={selected.fontStyle === "italic" ? "active" : ""} onClick={() => update({ ...selected, fontStyle: selected.fontStyle === "italic" ? "normal" : "italic" }, `Change ${selected.name} style`)}><i>I</i></button>
          {(["left", "center", "right"] as const).map((align) => <button key={align} aria-pressed={selected.align === align} className={selected.align === align ? "active" : ""} onClick={() => update({ ...selected, align }, `Align ${selected.name}`)}>{align.charAt(0).toUpperCase()}</button>)}
        </div>
        <div className="nc-layer-property-grid">
          <label>Direction<select aria-label="Text direction" value={selected.direction} onChange={(event) => update({ ...selected, direction: event.target.value as typeof selected.direction }, `Change ${selected.name} direction`)}><option value="auto">Auto</option><option value="ltr">LTR</option><option value="rtl">RTL</option></select></label>
          <label>Vertical<select aria-label="Text vertical alignment" value={selected.verticalAlign} onChange={(event) => update({ ...selected, verticalAlign: event.target.value as typeof selected.verticalAlign }, `Change ${selected.name} vertical alignment`)}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
          <label>Line height<CommitField ariaLabel="Text line height" type="number" step={0.05} value={selected.lineHeight} onCommit={(value) => updatePositiveTextNumber(selected, "lineHeight", value, update)} /></label>
          <label>Letter space<CommitField ariaLabel="Text letter spacing" type="number" step={0.25} value={selected.letterSpacing} onCommit={(value) => updateFiniteTextNumber(selected, "letterSpacing", value, update)} /></label>
          <label>Box width<CommitField ariaLabel="Text box width" type="number" step={1} value={selected.width ?? ""} onCommit={(value) => updateOptionalTextDimension(selected, "width", value, update)} /></label>
          <label>Box height<CommitField ariaLabel="Text box height" type="number" step={1} value={selected.height ?? ""} onCommit={(value) => updateOptionalTextDimension(selected, "height", value, update)} /></label>
          <label>Padding<CommitField ariaLabel="Text padding" type="number" step={1} value={selected.padding} onCommit={(value) => updateNonNegativeTextNumber(selected, "padding", value, update)} /></label>
          <label>Corner radius<CommitField ariaLabel="Text corner radius" type="number" step={1} value={selected.cornerRadius} onCommit={(value) => updateNonNegativeTextNumber(selected, "cornerRadius", value, update)} /></label>
        </div>
        <label className="nc-layer-color-field">Text color<input aria-label="Text color" type="color" value={safeColor(selected.fill)} onChange={(event) => update({ ...selected, fill: event.target.value }, `Change ${selected.name} color`)} /></label>

        <div className="nc-layer-section-title">Box & effects</div>
        <label className="nc-layer-check"><input aria-label="Text background enabled" type="checkbox" checked={selected.backgroundColor !== null} onChange={(event) => update({ ...selected, backgroundColor: event.target.checked ? "#000000" : null }, `Change ${selected.name} background`)} /> Background</label>
        {selected.backgroundColor !== null && <label className="nc-layer-color-field">Background<input aria-label="Text background color" type="color" value={safeColor(selected.backgroundColor)} onChange={(event) => update({ ...selected, backgroundColor: event.target.value }, `Change ${selected.name} background`)} /></label>}
        <label className="nc-layer-check"><input aria-label="Text border enabled" type="checkbox" checked={selected.borderColor !== null} onChange={(event) => update({ ...selected, borderColor: event.target.checked ? "#ffffff" : null, borderWidth: event.target.checked ? Math.max(1, selected.borderWidth) : selected.borderWidth }, `Change ${selected.name} border`)} /> Border</label>
        {selected.borderColor !== null && <>
          <label className="nc-layer-color-field">Border<input aria-label="Text border color" type="color" value={safeColor(selected.borderColor)} onChange={(event) => update({ ...selected, borderColor: event.target.value }, `Change ${selected.name} border`)} /></label>
          <label>Border width<CommitField ariaLabel="Text border width" type="number" step={1} value={selected.borderWidth} onCommit={(value) => updateNonNegativeTextNumber(selected, "borderWidth", value, update)} /></label>
        </>}
        <label className="nc-layer-check"><input aria-label="Text shadow enabled" type="checkbox" checked={selected.shadowColor !== null} onChange={(event) => update({ ...selected, shadowColor: event.target.checked ? "#000000" : null, shadowBlur: event.target.checked ? Math.max(2, selected.shadowBlur) : selected.shadowBlur }, `Change ${selected.name} shadow`)} /> Shadow</label>
        {selected.shadowColor !== null && <>
          <label className="nc-layer-color-field">Shadow<input aria-label="Text shadow color" type="color" value={safeColor(selected.shadowColor)} onChange={(event) => update({ ...selected, shadowColor: event.target.value }, `Change ${selected.name} shadow`)} /></label>
          <div className="nc-layer-property-grid">
            <label>Blur<CommitField ariaLabel="Text shadow blur" type="number" step={1} value={selected.shadowBlur} onCommit={(value) => updateNonNegativeTextNumber(selected, "shadowBlur", value, update)} /></label>
            <label>Offset X<CommitField ariaLabel="Text shadow offset X" type="number" step={1} value={selected.shadowOffsetX} onCommit={(value) => updateFiniteTextNumber(selected, "shadowOffsetX", value, update)} /></label>
            <label>Offset Y<CommitField ariaLabel="Text shadow offset Y" type="number" step={1} value={selected.shadowOffsetY} onCommit={(value) => updateFiniteTextNumber(selected, "shadowOffsetY", value, update)} /></label>
          </div>
        </>}
      </>}

      {selected.kind === "callout" && <>
        <label>Text<CommitField ariaLabel="Layer text" value={selected.text} onCommit={(text) => update({ ...selected, text }, `Edit ${selected.name} text`)} /></label>
        <label>Font<select aria-label="Layer font" value={selected.fontFamily} onChange={(event) => update({ ...selected, fontFamily: event.target.value }, `Change ${selected.name} font`)}>{SAFE_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
        <label>Font size<CommitField ariaLabel="Layer font size" type="number" step={1} value={selected.fontSize} onCommit={(value) => {
          const size = Number(value); if (Number.isFinite(size) && size > 0) update({ ...selected, fontSize: size }, `Resize ${selected.name} text`);
        }} /></label>
      </>}

      {isShapeLayer(selected) && <>
        <div className="nc-layer-section-title">Shape appearance</div>
        <label>Preset<select aria-label="Shape preset" defaultValue="" onChange={(event) => {
          if (!event.target.value) return;
          update(applyShapePreset(selected, event.target.value as EditorShapePreset["id"]), `Apply ${event.target.value} shape preset`);
          event.currentTarget.value = "";
        }}><option value="">Custom…</option>{EDITOR_SHAPE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
      </>}

      {(selected.kind === "rectangle" || selected.kind === "ellipse" || selected.kind === "callout" || selected.kind === "step") && <>
        <label className="nc-layer-check"><input aria-label="Shape fill enabled" type="checkbox" checked={selected.fill !== null} onChange={(event) => update({ ...selected, fill: event.target.checked ? safeColor(selected.stroke) : null }, `Change ${selected.name} fill`)} /> Fill shape</label>
        {selected.fill !== null && <label className="nc-layer-color-field">Fill color<input aria-label="Shape fill color" type="color" value={safeColor(selected.fill)} onChange={(event) => update({ ...selected, fill: event.target.value }, `Change ${selected.name} fill`)} /></label>}
      </>}

      {isShapeLayer(selected) && <>
        <label className="nc-layer-color-field">Stroke color<input aria-label="Layer stroke color" type="color" value={safeColor(selected.stroke)} onChange={(event) => update({ ...selected, stroke: event.target.value }, `Change ${selected.name} stroke`)} /></label>
        <label>Stroke width<CommitField ariaLabel="Layer stroke width" type="number" step={1} value={selected.strokeWidth} onCommit={(value) => {
          const width = Number(value); if (Number.isFinite(width) && width > 0) update({ ...selected, strokeWidth: width }, `Change ${selected.name} stroke width`);
        }} /></label>
        <label>Stroke style<select aria-label="Layer stroke style" value={selected.strokeStyle} onChange={(event) => update({ ...selected, strokeStyle: event.target.value as typeof selected.strokeStyle }, `Change ${selected.name} stroke style`)}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
      </>}

      {(selected.kind === "rectangle" || selected.kind === "callout") && <label>Corner radius<CommitField ariaLabel="Shape corner radius" type="number" step={1} value={selected.cornerRadius} onCommit={(value) => updateShapeNonNegativeNumber(selected, "cornerRadius", value, update)} /></label>}

      {selected.kind === "rectangle" && <div className="nc-layer-property-grid">
        <label>Width<CommitField ariaLabel="Shape width" type="number" step={1} value={selected.width} onCommit={(value) => updateShapePositiveNumber(selected, "width", value, update)} /></label>
        <label>Height<CommitField ariaLabel="Shape height" type="number" step={1} value={selected.height} onCommit={(value) => updateShapePositiveNumber(selected, "height", value, update)} /></label>
      </div>}

      {selected.kind === "ellipse" && <div className="nc-layer-property-grid">
        <label>Radius X<CommitField ariaLabel="Shape radius X" type="number" step={1} value={selected.radiusX} onCommit={(value) => updateShapePositiveNumber(selected, "radiusX", value, update)} /></label>
        <label>Radius Y<CommitField ariaLabel="Shape radius Y" type="number" step={1} value={selected.radiusY} onCommit={(value) => updateShapePositiveNumber(selected, "radiusY", value, update)} /></label>
      </div>}

      {selected.kind === "arrow" && <>
        <div className="nc-layer-section-title">Arrow heads</div>
        <label>Heads<select aria-label="Arrow heads" value={arrowHeadMode(selected)} onChange={(event) => update(setArrowHeadMode(selected, event.target.value), `Change ${selected.name} heads`)}><option value="end">End</option><option value="start">Start</option><option value="both">Both</option><option value="none">None</option></select></label>
        <button className="nc-layer-wide-action" onClick={() => update(reverseArrow(selected), `Reverse ${selected.name}`)}><RotateCcw size={13} /> Reverse direction</button>
        <div className="nc-layer-property-grid">
          <label>Head length<CommitField ariaLabel="Arrow head length" type="number" step={1} value={selected.pointerLength} onCommit={(value) => updateShapePositiveNumber(selected, "pointerLength", value, update)} /></label>
          <label>Head width<CommitField ariaLabel="Arrow head width" type="number" step={1} value={selected.pointerWidth} onCommit={(value) => updateShapePositiveNumber(selected, "pointerWidth", value, update)} /></label>
        </div>
      </>}

      {selected.kind === "callout" && <>
        <div className="nc-layer-property-grid">
          <label>Width<CommitField ariaLabel="Callout width" type="number" step={1} value={selected.width} onCommit={(value) => updateShapePositiveNumber(selected, "width", value, update)} /></label>
          <label>Height<CommitField ariaLabel="Callout height" type="number" step={1} value={selected.height} onCommit={(value) => updateShapePositiveNumber(selected, "height", value, update)} /></label>
        </div>
        <label className="nc-layer-color-field">Callout text<input aria-label="Callout text color" type="color" value={safeColor(selected.textColor)} onChange={(event) => update({ ...selected, textColor: event.target.value }, `Change ${selected.name} text color`)} /></label>
      </>}

      {selected.kind === "step" && <>
        <div className="nc-layer-section-title">Step marker</div>
        <div className="nc-layer-property-grid">
          <label>Number<CommitField ariaLabel="Step number" type="number" step={1} value={selected.number} onCommit={(value) => updateStepNumber(selected, value, update)} /></label>
          <label>Radius<CommitField ariaLabel="Step radius" type="number" step={1} value={selected.radius} onCommit={(value) => updateShapePositiveNumber(selected, "radius", value, update)} /></label>
          <label>Font size<CommitField ariaLabel="Step font size" type="number" step={1} value={selected.fontSize} onCommit={(value) => updateShapePositiveNumber(selected, "fontSize", value, update)} /></label>
        </div>
        <label>Font<select aria-label="Step font" value={selected.fontFamily} onChange={(event) => update({ ...selected, fontFamily: event.target.value }, `Change ${selected.name} font`)}>{SAFE_FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
        <label className="nc-layer-color-field">Number color<input aria-label="Step text color" type="color" value={safeColor(selected.textColor)} onChange={(event) => update({ ...selected, textColor: event.target.value }, `Change ${selected.name} text color`)} /></label>
      </>}
    </div> : <div className="nc-layer-no-selection">{selectedLayerIds.length > 1 ? `${selectedLayerIds.length} layers selected. Use the arrange controls or drag the selection on canvas.` : "Select a layer to edit its properties."}</div>}
  </aside>;
}

function updateTransform(layer: EditorLayer, key: keyof EditorLayer["transform"], rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || ((key === "scaleX" || key === "scaleY") && value === 0)) return;
  const transform = layer.kind === "group" && (key === "scaleX" || key === "scaleY")
    ? { ...layer.transform, scaleX: value, scaleY: value }
    : { ...layer.transform, [key]: value };
  update({ ...layer, transform }, `Transform ${layer.name}`);
}

type PositiveTextNumberKey = "lineHeight";
type NonNegativeTextNumberKey = "padding" | "cornerRadius" | "borderWidth" | "shadowBlur";
type FiniteTextNumberKey = "letterSpacing" | "shadowOffsetX" | "shadowOffsetY";

function updatePositiveTextNumber(layer: EditorTextLayer, key: PositiveTextNumberKey, rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  const value = Number(rawValue);
  if (Number.isFinite(value) && value > 0) update({ ...layer, [key]: value }, `Change ${layer.name} ${key}`);
}

function updateNonNegativeTextNumber(layer: EditorTextLayer, key: NonNegativeTextNumberKey, rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  const value = Number(rawValue);
  if (Number.isFinite(value) && value >= 0) update({ ...layer, [key]: value }, `Change ${layer.name} ${key}`);
}

function updateFiniteTextNumber(layer: EditorTextLayer, key: FiniteTextNumberKey, rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  const value = Number(rawValue);
  if (Number.isFinite(value)) update({ ...layer, [key]: value }, `Change ${layer.name} ${key}`);
}

function updateOptionalTextDimension(layer: EditorTextLayer, key: "width" | "height", rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  if (!rawValue.trim()) {
    const next = { ...layer };
    delete next[key];
    update(next, `Use automatic ${layer.name} ${key}`);
    return;
  }
  const value = Number(rawValue);
  if (Number.isFinite(value) && value > 0) update({ ...layer, [key]: value }, `Change ${layer.name} ${key}`);
}

function updateShapePositiveNumber<T extends EditorLayer, K extends keyof T>(layer: T, key: K, rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  const value = Number(rawValue);
  if (Number.isFinite(value) && value > 0) update({ ...layer, [key]: value } as EditorLayer, `Change ${layer.name} ${String(key)}`);
}

function updateShapeNonNegativeNumber<T extends EditorLayer, K extends keyof T>(layer: T, key: K, rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  const value = Number(rawValue);
  if (Number.isFinite(value) && value >= 0) update({ ...layer, [key]: value } as EditorLayer, `Change ${layer.name} ${String(key)}`);
}

function updateStepNumber(layer: Extract<EditorLayer, { kind: "step" }>, rawValue: string, update: (layer: EditorLayer, label: string) => void): void {
  const value = Number(rawValue);
  if (Number.isInteger(value) && value > 0) update({ ...layer, number: value, name: `Step ${value}` }, `Renumber ${layer.name}`);
}

function arrowHeadMode(layer: EditorArrowLayer): "start" | "end" | "both" | "none" {
  if (layer.pointerAtBeginning && layer.pointerAtEnding) return "both";
  if (layer.pointerAtBeginning) return "start";
  if (layer.pointerAtEnding) return "end";
  return "none";
}

function setArrowHeadMode(layer: EditorArrowLayer, mode: string): EditorArrowLayer {
  return { ...layer, pointerAtBeginning: mode === "start" || mode === "both", pointerAtEnding: mode === "end" || mode === "both" };
}
