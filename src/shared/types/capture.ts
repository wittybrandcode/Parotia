import type { ElementReference } from "./element";

export type CaptureMode = "VISIBLE" | "FULL_PAGE" | "ELEMENT" | "REGION";

export type CaptureStatus =
  | "IDLE"
  | "PREPARING"
  | "VALIDATING"
  | "RENDERING"
  | "ENCODING"
  | "READY"
  | "EXPORTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface CaptureTarget {
  type: "VIEWPORT" | "ELEMENT";
  element?: ElementReference;
}

export interface CaptureProgress {
  current: number;
  total: number;
  phase: "PREPARING" | "RENDERING" | "ENCODING" | "STITCHING";
}

export interface CaptureError {
  code: CaptureErrorCode;
  message: string;
}

export type CaptureErrorCode =
  | "NOT_FROZEN"
  | "TARGET_NOT_FOUND"
  | "TARGET_INVALID"
  | "UNSUPPORTED_PAGE"
  | "CAPTURE_PERMISSION_DENIED"
  | "CAPTURE_TIMEOUT"
  | "RENDER_FAILED"
  | "ENCODE_FAILED"
  | "STITCH_FAILED"
  | "BITMAP_TOO_LARGE"
  | "CANCELLED"
  | "UNKNOWN";

export interface CaptureDiagnostics {
  cssWidth?: number;
  cssHeight?: number;
  outputWidth: number;
  outputHeight: number;
  scale: number;
  segmentCount: number;
  renderDurationMs?: number;
  encodeDurationMs?: number;
  totalDurationMs?: number;
}

export interface CaptureResult {
  success: boolean;
  mode: CaptureMode;
  width: number;
  height: number;
  scale: number;
  mimeType: "image/png";
  sizeBytes: number;
  blob?: Blob;
  diagnostics?: CaptureDiagnostics;
  error?: CaptureError;
}

export interface CaptureState {
  status: CaptureStatus;
  mode?: CaptureMode;
  target?: CaptureTarget;
  progress?: CaptureProgress;
  result?: CaptureResult;
}

