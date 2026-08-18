import type { CaptureState } from "./capture";
import type { CleanupState } from "./cleanup";
import type { ExtractionState } from "./extraction";
import type { FreezeState } from "./freeze";
import type { InspectionState } from "./inspection";
import type { PageContext } from "./page";

export type SessionStatus =
  | "CREATED"
  | "INITIALIZING"
  | "ACTIVE"
  | "CAPTURING"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

/** One entry in the session action log, derived from the history stacks. */
export interface ActionLogEntry {
  id: string;
  label: string;
  at: number;
  /** True when the entry is still in the undo stack (can be undone). */
  undoable: boolean;
}

/**
 * Central runtime container. The session coordinates state, events and
 * lifecycle but delegates engine logic to the owning engines — it must not
 * become a monolithic class.
 */
export interface NewsCleanSession {
  id: string;
  createdAt: number;

  page: PageContext;
  freeze: FreezeState;
  extraction: ExtractionState;
  inspection: InspectionState;
  cleanup: CleanupState;
  capture: CaptureState;

  status: SessionStatus;
}

/** Valid lifecycle transitions: `CREATED → INITIALIZING → ACTIVE → … → COMPLETED`. */
export const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  CREATED: ["INITIALIZING", "FAILED", "CANCELLED"],
  INITIALIZING: ["ACTIVE", "FAILED", "CANCELLED"],
  ACTIVE: ["CAPTURING", "COMPLETED", "FAILED", "CANCELLED"],
  CAPTURING: ["ACTIVE", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};
