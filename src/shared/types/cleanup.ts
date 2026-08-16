import type { ElementReference, ElementSnapshot } from "./element";
import type { ConfidenceLevel } from "./extraction";

export type CleanupAction = "DELETE" | "HIDE" | "KEEP";

export type CleanupSource = "USER" | "PRESET" | "SYSTEM";

export type CleanupCategory =
  | "ADVERTISEMENT"
  | "SIDEBAR"
  | "NEWSLETTER"
  | "SOCIAL"
  | "COOKIE"
  | "RELATED"
  | "NAVIGATION"
  | "PROMOTION"
  | "OTHER";

/** An editorial intent, expressed before it becomes a mutation. */
export interface CleanupIntent {
  id: string;
  action: CleanupAction;
  target: ElementReference;
  source: CleanupSource;
  confidence?: ConfidenceLevel;
  reason?: string;
}

/** Reusable rule. A rule resolves against the CURRENT DOM every time it runs. */
export interface CleanupRule {
  id: string;
  selector: string;
  action: CleanupAction;
  category?: CleanupCategory;
  enabled: boolean;
  required?: boolean;
}

export interface CleanupOperation {
  id: string;
  timestamp: number;

  action: CleanupAction;
  target: ElementReference;
  source: CleanupSource;

  before: ElementSnapshot;
  after: CleanupAfterState;
}

export interface CleanupAfterState {
  status: "DELETED" | "HIDDEN" | "KEPT";
}

/** One logical bulk operation ("Delete Similar") — undoable as a single unit. */
export interface BatchCleanupOperation {
  id: string;
  timestamp: number;
  source: CleanupSource;
  action: CleanupAction;
  targets: ElementReference[];
}

/** Session-scoped cleanup state owned by the Cleanup Engine. */
export interface CleanupState {
  removedCount: number;
  hiddenCount: number;
  keptCount: number;
  activeRules: CleanupRule[];
  protectedTargets: ElementReference[];
  /** Whether the currently selected element is hidden (drives Hide ⇄ Show). */
  selectedHidden: boolean;
}
