import { createId } from "@shared/utils/id";

export const EDITOR_DOCUMENT_SCHEMA = "parotia.editor-document" as const;
export const EDITOR_DOCUMENT_VERSION = 4 as const;

export type EditorStrokeStyle = "solid" | "dashed" | "dotted";

export interface EditorTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface EditorLayerBase {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  transform: EditorTransform;
}

export interface EditorImageLayer extends EditorLayerBase {
  kind: "image";
  source: string;
  width: number;
  height: number;
}

export interface EditorTextLayer extends EditorLayerBase {
  kind: "text";
  text: string;
  fontFamily: string;
  fontFallback: "sans-serif" | "serif" | "monospace";
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  direction: "auto" | "ltr" | "rtl";
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  fill: string;
  width?: number;
  height?: number;
  lineHeight: number;
  letterSpacing: number;
  padding: number;
  backgroundColor: string | null;
  borderColor: string | null;
  borderWidth: number;
  cornerRadius: number;
  shadowColor: string | null;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export const DEFAULT_EDITOR_TEXT_STYLE = {
  fontFamily: "sans-serif", fontFallback: "sans-serif", fontSize: 24, fontWeight: 400, fontStyle: "normal",
  direction: "auto", align: "left", verticalAlign: "top", fill: "#c1e899", lineHeight: 1.2, letterSpacing: 0,
  padding: 0, backgroundColor: null, borderColor: null, borderWidth: 0, cornerRadius: 0,
  shadowColor: null, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
} as const satisfies Omit<EditorTextLayer, keyof EditorLayerBase | "kind" | "text" | "width" | "height">;

export interface EditorShapeStyle {
  fill: string | null;
  stroke: string;
  strokeWidth: number;
  strokeStyle: EditorStrokeStyle;
}

export interface EditorRectangleLayer extends EditorLayerBase, EditorShapeStyle {
  kind: "rectangle";
  width: number;
  height: number;
  cornerRadius: number;
}

export interface EditorEllipseLayer extends EditorLayerBase, EditorShapeStyle {
  kind: "ellipse";
  radiusX: number;
  radiusY: number;
}

export interface EditorLineLayer extends EditorLayerBase {
  kind: "line";
  points: number[];
  stroke: string;
  strokeWidth: number;
  strokeStyle: EditorStrokeStyle;
  tension: number;
}

export interface EditorArrowLayer extends EditorLayerBase {
  kind: "arrow";
  points: number[];
  stroke: string;
  strokeWidth: number;
  strokeStyle: EditorStrokeStyle;
  pointerLength: number;
  pointerWidth: number;
  pointerAtBeginning: boolean;
  pointerAtEnding: boolean;
}

export interface EditorCalloutLayer extends EditorLayerBase, EditorShapeStyle {
  kind: "callout";
  text: string;
  width: number;
  height: number;
  cornerRadius: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
}

export interface EditorStepLayer extends EditorLayerBase, EditorShapeStyle {
  kind: "step";
  number: number;
  radius: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
}

export interface EditorGroupLayer extends EditorLayerBase {
  kind: "group";
  children: EditorLayer[];
}

export type EditorLayer =
  | EditorImageLayer
  | EditorTextLayer
  | EditorRectangleLayer
  | EditorEllipseLayer
  | EditorLineLayer
  | EditorArrowLayer
  | EditorCalloutLayer
  | EditorStepLayer
  | EditorGroupLayer;

export interface EditorBackground {
  kind: "image";
  source: string;
  width: number;
  height: number;
}

export interface EditorDocument {
  schema: typeof EDITOR_DOCUMENT_SCHEMA;
  version: typeof EDITOR_DOCUMENT_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
  canvas: {
    width: number;
    height: number;
    backgroundColor: string | null;
  };
  background: EditorBackground;
  layers: EditorLayer[];
}

export interface CreateEditorDocumentInput {
  source: string;
  width: number;
  height: number;
  id?: string;
  now?: string;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, name: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as JsonRecord;
}

function string(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function positive(value: unknown, name: string): number {
  const result = finite(value, name);
  if (result <= 0) throw new Error(`${name} must be positive`);
  return result;
}

function nonNegative(value: unknown, name: string): number {
  const result = finite(value, name);
  if (result < 0) throw new Error(`${name} must not be negative`);
  return result;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be boolean`);
  return value;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  return string(value, name, true);
}

function enumValue<const T extends readonly string[]>(value: unknown, name: string, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${name} is unsupported`);
  return value as T[number];
}

function transform(value: unknown, name: string): EditorTransform {
  const item = record(value, name);
  const scaleX = finite(item.scaleX, `${name}.scaleX`);
  const scaleY = finite(item.scaleY, `${name}.scaleY`);
  if (scaleX === 0 || scaleY === 0) throw new Error(`${name} scale cannot be zero`);
  return {
    x: finite(item.x, `${name}.x`),
    y: finite(item.y, `${name}.y`),
    scaleX,
    scaleY,
    rotation: finite(item.rotation, `${name}.rotation`),
  };
}

function base(value: JsonRecord, path: string): EditorLayerBase {
  const opacity = finite(value.opacity, `${path}.opacity`);
  if (opacity < 0 || opacity > 1) throw new Error(`${path}.opacity must be between 0 and 1`);
  return {
    id: string(value.id, `${path}.id`),
    name: string(value.name, `${path}.name`),
    order: finite(value.order, `${path}.order`),
    visible: boolean(value.visible, `${path}.visible`),
    locked: boolean(value.locked, `${path}.locked`),
    opacity,
    transform: transform(value.transform, `${path}.transform`),
  };
}

function shapeStyle(value: JsonRecord, path: string): EditorShapeStyle {
  return {
    fill: value.fill === null ? null : string(value.fill, `${path}.fill`, true),
    stroke: string(value.stroke, `${path}.stroke`, true),
    strokeWidth: positive(value.strokeWidth, `${path}.strokeWidth`),
    strokeStyle: enumValue(value.strokeStyle, `${path}.strokeStyle`, ["solid", "dashed", "dotted"] as const),
  };
}

function positiveInteger(value: unknown, name: string): number {
  const result = positive(value, name);
  if (!Number.isInteger(result)) throw new Error(`${name} must be an integer`);
  return result;
}

function points(value: unknown, path: string): number[] {
  if (!Array.isArray(value) || value.length < 4 || value.length % 2 !== 0) throw new Error(`${path}.points must contain coordinate pairs`);
  return value.map((point, pointIndex) => finite(point, `${path}.points[${pointIndex}]`));
}

function normalizeLayers(value: unknown[], path: string): EditorLayer[] {
  return value.map((entry, index) => layer(entry, `${path}[${index}]`)).sort((a, b) => a.order - b.order).map((entry, order) => ({ ...entry, order }));
}

function layer(value: unknown, path: string): EditorLayer {
  const item = record(value, path);
  const common = base(item, path);
  const kind = enumValue(item.kind, `${path}.kind`, ["image", "text", "rectangle", "ellipse", "line", "arrow", "callout", "step", "group"] as const);
  switch (kind) {
    case "image":
      return { ...common, kind, source: string(item.source, `${path}.source`), width: positive(item.width, `${path}.width`), height: positive(item.height, `${path}.height`) };
    case "text": {
      const width = item.width === undefined ? undefined : positive(item.width, `${path}.width`);
      const height = item.height === undefined ? undefined : positive(item.height, `${path}.height`);
      return {
        ...common, kind, text: string(item.text, `${path}.text`, true), fontFamily: string(item.fontFamily, `${path}.fontFamily`),
        fontFallback: enumValue(item.fontFallback, `${path}.fontFallback`, ["sans-serif", "serif", "monospace"] as const),
        fontSize: positive(item.fontSize, `${path}.fontSize`), fontWeight: positive(item.fontWeight, `${path}.fontWeight`),
        fontStyle: enumValue(item.fontStyle, `${path}.fontStyle`, ["normal", "italic"] as const),
        direction: enumValue(item.direction, `${path}.direction`, ["auto", "ltr", "rtl"] as const),
        align: enumValue(item.align, `${path}.align`, ["left", "center", "right"] as const),
        verticalAlign: enumValue(item.verticalAlign, `${path}.verticalAlign`, ["top", "middle", "bottom"] as const),
        fill: string(item.fill, `${path}.fill`), lineHeight: positive(item.lineHeight, `${path}.lineHeight`),
        letterSpacing: finite(item.letterSpacing, `${path}.letterSpacing`), padding: nonNegative(item.padding, `${path}.padding`),
        backgroundColor: nullableString(item.backgroundColor, `${path}.backgroundColor`), borderColor: nullableString(item.borderColor, `${path}.borderColor`),
        borderWidth: nonNegative(item.borderWidth, `${path}.borderWidth`), cornerRadius: nonNegative(item.cornerRadius, `${path}.cornerRadius`),
        shadowColor: nullableString(item.shadowColor, `${path}.shadowColor`), shadowBlur: nonNegative(item.shadowBlur, `${path}.shadowBlur`),
        shadowOffsetX: finite(item.shadowOffsetX, `${path}.shadowOffsetX`), shadowOffsetY: finite(item.shadowOffsetY, `${path}.shadowOffsetY`),
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
      };
    }
    case "rectangle":
      return { ...common, ...shapeStyle(item, path), kind, width: positive(item.width, `${path}.width`), height: positive(item.height, `${path}.height`), cornerRadius: nonNegative(item.cornerRadius, `${path}.cornerRadius`) };
    case "ellipse":
      return { ...common, ...shapeStyle(item, path), kind, radiusX: positive(item.radiusX, `${path}.radiusX`), radiusY: positive(item.radiusY, `${path}.radiusY`) };
    case "line":
      return { ...common, kind, points: points(item.points, path), stroke: string(item.stroke, `${path}.stroke`), strokeWidth: positive(item.strokeWidth, `${path}.strokeWidth`), strokeStyle: enumValue(item.strokeStyle, `${path}.strokeStyle`, ["solid", "dashed", "dotted"] as const), tension: finite(item.tension, `${path}.tension`) };
    case "arrow":
      return {
        ...common, kind, points: points(item.points, path), stroke: string(item.stroke, `${path}.stroke`), strokeWidth: positive(item.strokeWidth, `${path}.strokeWidth`),
        strokeStyle: enumValue(item.strokeStyle, `${path}.strokeStyle`, ["solid", "dashed", "dotted"] as const),
        pointerLength: positive(item.pointerLength, `${path}.pointerLength`), pointerWidth: positive(item.pointerWidth, `${path}.pointerWidth`),
        pointerAtBeginning: boolean(item.pointerAtBeginning, `${path}.pointerAtBeginning`), pointerAtEnding: boolean(item.pointerAtEnding, `${path}.pointerAtEnding`),
      };
    case "callout":
      return { ...common, ...shapeStyle(item, path), kind, text: string(item.text, `${path}.text`, true), width: positive(item.width, `${path}.width`), height: positive(item.height, `${path}.height`), cornerRadius: nonNegative(item.cornerRadius, `${path}.cornerRadius`), fontFamily: string(item.fontFamily, `${path}.fontFamily`), fontSize: positive(item.fontSize, `${path}.fontSize`), textColor: string(item.textColor, `${path}.textColor`) };
    case "step":
      return { ...common, ...shapeStyle(item, path), kind, number: positiveInteger(item.number, `${path}.number`), radius: positive(item.radius, `${path}.radius`), fontFamily: string(item.fontFamily, `${path}.fontFamily`), fontSize: positive(item.fontSize, `${path}.fontSize`), textColor: string(item.textColor, `${path}.textColor`) };
    case "group":
      if (!Array.isArray(item.children) || item.children.length === 0) throw new Error(`${path}.children must contain at least one layer`);
      if (common.transform.scaleX <= 0 || common.transform.scaleY <= 0 || Math.abs(common.transform.scaleX - common.transform.scaleY) > 1e-6) throw new Error(`${path}.transform must use a positive uniform scale`);
      return { ...common, kind, children: normalizeLayers(item.children, `${path}.children`) };
  }
}

function allLayerIds(layers: EditorLayer[]): string[] {
  return layers.flatMap((entry) => [entry.id, ...(entry.kind === "group" ? allLayerIds(entry.children) : [])]);
}

function parseCurrentVersion(value: unknown): EditorDocument {
  const item = record(value, "document");
  if (item.schema !== EDITOR_DOCUMENT_SCHEMA || item.version !== EDITOR_DOCUMENT_VERSION) throw new Error("Unsupported editor document schema or version");
  const canvas = record(item.canvas, "canvas");
  const background = record(item.background, "background");
  if (background.kind !== "image") throw new Error("background.kind must be image");
  if (!Array.isArray(item.layers)) throw new Error("layers must be an array");
  const parsedLayers = normalizeLayers(item.layers, "layers");
  const layerIds = allLayerIds(parsedLayers);
  const ids = new Set(layerIds);
  if (ids.size !== layerIds.length) throw new Error("Layer identifiers must be unique across the document");
  return {
    schema: EDITOR_DOCUMENT_SCHEMA,
    version: EDITOR_DOCUMENT_VERSION,
    id: string(item.id, "document.id"),
    createdAt: string(item.createdAt, "document.createdAt"),
    updatedAt: string(item.updatedAt, "document.updatedAt"),
    canvas: {
      width: positive(canvas.width, "canvas.width"),
      height: positive(canvas.height, "canvas.height"),
      backgroundColor: nullableString(canvas.backgroundColor, "canvas.backgroundColor"),
    },
    background: {
      kind: "image",
      source: string(background.source, "background.source"),
      width: positive(background.width, "background.width"),
      height: positive(background.height, "background.height"),
    },
    layers: parsedLayers,
  };
}

function migrate(value: unknown): unknown {
  const item = record(value, "document");
  if (item.schema !== EDITOR_DOCUMENT_SCHEMA) return value;
  if (item.version === 1 || item.version === 2 || item.version === 3) return {
    ...item, version: EDITOR_DOCUMENT_VERSION,
    layers: Array.isArray(item.layers) ? item.layers.map(migrateLayer) : item.layers,
  };
  if (item.version !== 0) return value;
  const now = typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString();
  return {
    schema: EDITOR_DOCUMENT_SCHEMA,
    version: EDITOR_DOCUMENT_VERSION,
    id: item.id,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
    updatedAt: now,
    canvas: { width: item.width, height: item.height, backgroundColor: null },
    background: { kind: "image", source: item.backgroundDataUrl, width: item.width, height: item.height },
    layers: Array.isArray(item.layers) ? item.layers.map(migrateLayer) : [],
  };
}

function migrateLayer(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = value as JsonRecord;
  if (item.kind === "text") {
    const migrated: JsonRecord = { ...item };
    for (const [key, fallback] of Object.entries(DEFAULT_EDITOR_TEXT_STYLE)) {
      if (migrated[key] === undefined) migrated[key] = fallback;
    }
    return migrated;
  }
  const migrated: JsonRecord = { ...item };
  if (["rectangle", "ellipse", "line", "arrow", "callout"].includes(String(item.kind)) && migrated.strokeStyle === undefined) migrated.strokeStyle = "solid";
  if (item.kind === "arrow") {
    if (migrated.pointerAtBeginning === undefined) migrated.pointerAtBeginning = false;
    if (migrated.pointerAtEnding === undefined) migrated.pointerAtEnding = true;
  }
  if (item.kind === "callout" && migrated.cornerRadius === undefined) migrated.cornerRadius = 6;
  if (item.kind === "group" && Array.isArray(item.children)) migrated.children = item.children.map(migrateLayer);
  return migrated;
}

export function identityTransform(x = 0, y = 0): EditorTransform {
  return { x, y, scaleX: 1, scaleY: 1, rotation: 0 };
}

export function createLayerBase(kind: EditorLayer["kind"], order: number, x = 0, y = 0): EditorLayerBase {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return {
    id: createId("editor-layer"), name: `${label} ${order + 1}`, order, visible: true, locked: false, opacity: 1,
    transform: identityTransform(x, y),
  };
}

export function createEditorDocument(input: CreateEditorDocumentInput): EditorDocument {
  if (!Number.isFinite(input.width) || input.width <= 0 || !Number.isFinite(input.height) || input.height <= 0) throw new Error("Editor document dimensions must be positive");
  if (!input.source) throw new Error("Editor document source is required");
  const now = input.now ?? new Date().toISOString();
  return {
    schema: EDITOR_DOCUMENT_SCHEMA,
    version: EDITOR_DOCUMENT_VERSION,
    id: input.id ?? createId("editor-document"),
    createdAt: now,
    updatedAt: now,
    canvas: { width: input.width, height: input.height, backgroundColor: null },
    background: { kind: "image", source: input.source, width: input.width, height: input.height },
    layers: [],
  };
}

export function parseEditorDocument(value: string | unknown): EditorDocument {
  let parsed: unknown;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new Error("Editor document is not valid JSON");
  }
  return parseCurrentVersion(migrate(parsed));
}

export function serializeEditorDocument(document: EditorDocument): string {
  return JSON.stringify(parseCurrentVersion(document));
}

export function cloneEditorDocument(document: EditorDocument): EditorDocument {
  return parseEditorDocument(serializeEditorDocument(document));
}
