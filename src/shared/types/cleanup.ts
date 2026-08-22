import type { ElementReference, ElementSnapshot } from "./element";

export type CleanupAction = "DELETE" | "HIDE";

export type CleanupSource = "USER" | "SYSTEM";

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
  status: "DELETED" | "HIDDEN";
}

/** Session-scoped cleanup state owned by the Cleanup Engine. */
export interface CleanupState {
  removedCount: number;
  hiddenCount: number;
  activeRules: CleanupRule[];
  /** Whether the currently selected element is hidden (drives Hide ⇄ Show). */
  selectedHidden: boolean;
}
