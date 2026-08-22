import type { BackgroundCommand, NewsCleanSession } from "@shared/types";
import type { DefaultCleanupEngine } from "../cleanup/cleanupEngine";
import type { CaptureStitcher } from "../capture/captureStitcher";
import type { ElementCaptureIsolator } from "../capture/elementCapture";
import type { FixedHeaderManager } from "../capture/fixedHeaders";
import type { DefaultExtractionEngine } from "../extraction/extractionEngine";
import type { DefaultFreezeEngine } from "../freeze/freezeEngine";
import type { KeyboardShortcuts } from "../keyboard/shortcuts";
import type { DefaultMutationEngine } from "../mutation/mutationEngine";
import type { OverlayInstance } from "../overlay/overlay";

/** Shared mutable context threaded through every command handler. */
export interface HandlerContext {
  session: NewsCleanSession | null;
  overlay: OverlayInstance | null;
  cleanup: DefaultCleanupEngine | null;
  stitcher: CaptureStitcher | null;
  shortcuts: KeyboardShortcuts | null;

  fixedHeaders: FixedHeaderManager;
  mutations: DefaultMutationEngine;
  freeze: DefaultFreezeEngine;
  extraction: DefaultExtractionEngine;
  elementCapture: ElementCaptureIsolator;

  deleteSimilarPreviews: Map<string, { signatures: string[]; expires: number }>;
  deleteSimilarToken: string | null;

  broadcastState(): void;
  ensureRuntime(): void;
  dispatch(cmd: BackgroundCommand): Promise<unknown>;
}
