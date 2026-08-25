import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, Circle, Copy, Eye, EyeOff, GripVertical, ImagePlus, Layers3, Lock, MessageSquare,
  Minus, Square, Trash2, Type, Unlock,
} from "lucide-react";
import type { EditorDocument, EditorLayer } from "./EditorDocument";
import type { LayerAlignment, LayerDistribution } from "./EditorLayerOperations";

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
  onAddImage(): void;
}

type DropEdge = "before" | "after";

const FONT_FAMILIES = ["sans-serif", "Arial", "Georgia", "Times New Roman", "Courier New", "Tahoma", "Trebuchet MS"];

function safeColor(value: string | null, fallback = "#000000"): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
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

export function LayerPanel({ document, selectedLayerIds, disabled, onSelect, onUpdate, onDelete, onDuplicate, onMove, onReorder, onGroup, onUngroup, onAlign, onDistribute, onCopy, onPaste, onAddImage }: LayerPanelProps) {
  const ordered = [...document.layers].sort((a, b) => b.order - a.order);
  const selectedSet = new Set(selectedLayerIds);
  const selected = selectedLayerIds.length === 1 ? document.layers.find((layer) => layer.id === selectedLayerIds[0]) ?? null : null;
  const selectionAnchor = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: DropEdge } | null>(null);
  const update = (next: EditorLayer, label: string): void => onUpdate(next, label);
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

      {(selected.kind === "text" || selected.kind === "callout") && <>
        <label>Text<CommitField ariaLabel="Layer text" value={selected.text} onCommit={(text) => update({ ...selected, text }, `Edit ${selected.name} text`)} /></label>
        <label>Font<select aria-label="Layer font" value={selected.fontFamily} onChange={(event) => update({ ...selected, fontFamily: event.target.value }, `Change ${selected.name} font`)}>{FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}</select></label>
        <label>Font size<CommitField ariaLabel="Layer font size" type="number" step={1} value={selected.fontSize} onCommit={(value) => {
          const size = Number(value); if (Number.isFinite(size) && size > 0) update({ ...selected, fontSize: size }, `Resize ${selected.name} text`);
        }} /></label>
      </>}

      {selected.kind === "text" && <>
        <div className="nc-layer-segmented" role="group" aria-label="Text style">
          <button aria-pressed={selected.fontWeight >= 600} className={selected.fontWeight >= 600 ? "active" : ""} onClick={() => update({ ...selected, fontWeight: selected.fontWeight >= 600 ? 400 : 700 }, `Change ${selected.name} weight`)}>B</button>
          <button aria-pressed={selected.fontStyle === "italic"} className={selected.fontStyle === "italic" ? "active" : ""} onClick={() => update({ ...selected, fontStyle: selected.fontStyle === "italic" ? "normal" : "italic" }, `Change ${selected.name} style`)}><i>I</i></button>
          {(["left", "center", "right"] as const).map((align) => <button key={align} aria-pressed={selected.align === align} className={selected.align === align ? "active" : ""} onClick={() => update({ ...selected, align }, `Align ${selected.name}`)}>{align.charAt(0).toUpperCase()}</button>)}
        </div>
        <label className="nc-layer-color-field">Text color<input aria-label="Text color" type="color" value={safeColor(selected.fill)} onChange={(event) => update({ ...selected, fill: event.target.value }, `Change ${selected.name} color`)} /></label>
      </>}

      {(selected.kind === "rectangle" || selected.kind === "ellipse") && <>
        <label className="nc-layer-check"><input aria-label="Shape fill enabled" type="checkbox" checked={selected.fill !== null} onChange={(event) => update({ ...selected, fill: event.target.checked ? safeColor(selected.stroke) : null }, `Change ${selected.name} fill`)} /> Fill shape</label>
        {selected.fill !== null && <label className="nc-layer-color-field">Fill color<input aria-label="Shape fill color" type="color" value={safeColor(selected.fill)} onChange={(event) => update({ ...selected, fill: event.target.value }, `Change ${selected.name} fill`)} /></label>}
      </>}

      {(selected.kind === "rectangle" || selected.kind === "ellipse" || selected.kind === "line" || selected.kind === "arrow" || selected.kind === "callout") && <>
        <label className="nc-layer-color-field">Stroke color<input aria-label="Layer stroke color" type="color" value={safeColor(selected.stroke)} onChange={(event) => update({ ...selected, stroke: event.target.value }, `Change ${selected.name} stroke`)} /></label>
        <label>Stroke width<CommitField ariaLabel="Layer stroke width" type="number" step={1} value={selected.strokeWidth} onCommit={(value) => {
          const width = Number(value); if (Number.isFinite(width) && width > 0) update({ ...selected, strokeWidth: width }, `Change ${selected.name} stroke width`);
        }} /></label>
      </>}

      {selected.kind === "callout" && <>
        <label className="nc-layer-color-field">Callout fill<input aria-label="Callout fill color" type="color" value={safeColor(selected.fill, "#c1e899")} onChange={(event) => update({ ...selected, fill: event.target.value }, `Change ${selected.name} fill`)} /></label>
        <label className="nc-layer-color-field">Callout text<input aria-label="Callout text color" type="color" value={safeColor(selected.textColor)} onChange={(event) => update({ ...selected, textColor: event.target.value }, `Change ${selected.name} text color`)} /></label>
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
