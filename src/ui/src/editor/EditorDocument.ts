import { createId } from "@shared/utils/id";

export const EDITOR_DOCUMENT_SCHEMA = "parotia.editor-document" as const;
export const EDITOR_DOCUMENT_VERSION = 1 as const;

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
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  align: "left" | "center" | "right";
  fill: string;
  width?: number;
}

export interface EditorShapeStyle {
  fill: string | null;
  stroke: string;
  strokeWidth: number;
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
  tension: number;
}

export interface EditorArrowLayer extends EditorLayerBase {
  kind: "arrow";
  points: number[];
  stroke: string;
  strokeWidth: number;
  pointerLength: number;
  pointerWidth: number;
}

export interface EditorCalloutLayer extends EditorLayerBase, EditorShapeStyle {
  kind: "callout";
  text: string;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
}

export type EditorLayer =
  | EditorImageLayer
  | EditorTextLayer
  | EditorRectangleLayer
  | EditorEllipseLayer
  | EditorLineLayer
  | EditorArrowLayer
  | EditorCalloutLayer;

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

function base(value: JsonRecord, index: number): EditorLayerBase {
  const opacity = finite(value.opacity, `layers[${index}].opacity`);
  if (opacity < 0 || opacity > 1) throw new Error(`layers[${index}].opacity must be between 0 and 1`);
  return {
    id: string(value.id, `layers[${index}].id`),
    name: string(value.name, `layers[${index}].name`),
    order: finite(value.order, `layers[${index}].order`),
    visible: boolean(value.visible, `layers[${index}].visible`),
    locked: boolean(value.locked, `layers[${index}].locked`),
    opacity,
    transform: transform(value.transform, `layers[${index}].transform`),
  };
}

function shapeStyle(value: JsonRecord, index: number): EditorShapeStyle {
  return {
    fill: value.fill === null ? null : string(value.fill, `layers[${index}].fill`, true),
    stroke: string(value.stroke, `layers[${index}].stroke`, true),
    strokeWidth: positive(value.strokeWidth, `layers[${index}].strokeWidth`),
  };
}

function points(value: unknown, index: number): number[] {
  if (!Array.isArray(value) || value.length < 4 || value.length % 2 !== 0) throw new Error(`layers[${index}].points must contain coordinate pairs`);
  return value.map((point, pointIndex) => finite(point, `layers[${index}].points[${pointIndex}]`));
}

function layer(value: unknown, index: number): EditorLayer {
  const item = record(value, `layers[${index}]`);
  const common = base(item, index);
  const kind = enumValue(item.kind, `layers[${index}].kind`, ["image", "text", "rectangle", "ellipse", "line", "arrow", "callout"] as const);
  switch (kind) {
    case "image":
      return { ...common, kind, source: string(item.source, `layers[${index}].source`), width: positive(item.width, `layers[${index}].width`), height: positive(item.height, `layers[${index}].height`) };
    case "text": {
      const width = item.width === undefined ? undefined : positive(item.width, `layers[${index}].width`);
      return {
        ...common, kind, text: string(item.text, `layers[${index}].text`, true), fontFamily: string(item.fontFamily, `layers[${index}].fontFamily`),
        fontSize: positive(item.fontSize, `layers[${index}].fontSize`), fontWeight: positive(item.fontWeight, `layers[${index}].fontWeight`),
        fontStyle: enumValue(item.fontStyle, `layers[${index}].fontStyle`, ["normal", "italic"] as const),
        align: enumValue(item.align, `layers[${index}].align`, ["left", "center", "right"] as const), fill: string(item.fill, `layers[${index}].fill`),
        ...(width === undefined ? {} : { width }),
      };
    }
    case "rectangle":
      return { ...common, ...shapeStyle(item, index), kind, width: positive(item.width, `layers[${index}].width`), height: positive(item.height, `layers[${index}].height`), cornerRadius: finite(item.cornerRadius, `layers[${index}].cornerRadius`) };
    case "ellipse":
      return { ...common, ...shapeStyle(item, index), kind, radiusX: positive(item.radiusX, `layers[${index}].radiusX`), radiusY: positive(item.radiusY, `layers[${index}].radiusY`) };
    case "line":
      return { ...common, kind, points: points(item.points, index), stroke: string(item.stroke, `layers[${index}].stroke`), strokeWidth: positive(item.strokeWidth, `layers[${index}].strokeWidth`), tension: finite(item.tension, `layers[${index}].tension`) };
    case "arrow":
      return { ...common, kind, points: points(item.points, index), stroke: string(item.stroke, `layers[${index}].stroke`), strokeWidth: positive(item.strokeWidth, `layers[${index}].strokeWidth`), pointerLength: positive(item.pointerLength, `layers[${index}].pointerLength`), pointerWidth: positive(item.pointerWidth, `layers[${index}].pointerWidth`) };
    case "callout":
      return { ...common, ...shapeStyle(item, index), kind, text: string(item.text, `layers[${index}].text`, true), width: positive(item.width, `layers[${index}].width`), height: positive(item.height, `layers[${index}].height`), fontFamily: string(item.fontFamily, `layers[${index}].fontFamily`), fontSize: positive(item.fontSize, `layers[${index}].fontSize`), textColor: string(item.textColor, `layers[${index}].textColor`) };
  }
}

function parseVersionOne(value: unknown): EditorDocument {
  const item = record(value, "document");
  if (item.schema !== EDITOR_DOCUMENT_SCHEMA || item.version !== EDITOR_DOCUMENT_VERSION) throw new Error("Unsupported editor document schema or version");
  const canvas = record(item.canvas, "canvas");
  const background = record(item.background, "background");
  if (background.kind !== "image") throw new Error("background.kind must be image");
  if (!Array.isArray(item.layers)) throw new Error("layers must be an array");
  const parsedLayers = item.layers.map(layer).sort((a, b) => a.order - b.order);
  const ids = new Set(parsedLayers.map((entry) => entry.id));
  if (ids.size !== parsedLayers.length) throw new Error("Layer identifiers must be unique");
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
    layers: parsedLayers.map((entry, order) => ({ ...entry, order })),
  };
}

function migrate(value: unknown): unknown {
  const item = record(value, "document");
  if (item.schema !== EDITOR_DOCUMENT_SCHEMA) return value;
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
    layers: Array.isArray(item.layers) ? item.layers : [],
  };
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
  return parseVersionOne(migrate(parsed));
}

export function serializeEditorDocument(document: EditorDocument): string {
  return JSON.stringify(parseVersionOne(document));
}

export function cloneEditorDocument(document: EditorDocument): EditorDocument {
  return parseEditorDocument(serializeEditorDocument(document));
}
