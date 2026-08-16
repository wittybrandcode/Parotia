export type FreezeStatus = "UNFROZEN" | "FREEZING" | "FROZEN" | "DEGRADED" | "FAILED";

export type FreezeStrategy = "SOFT_FREEZE" | "HARD_FREEZE";

export interface FreezeDiagnostics {
  animationCount?: number;
  transitionCount?: number;
  mediaCount?: number;
  mutationObserverBlocked?: boolean;
  pendingNetworkActivity?: boolean;
}

export interface FreezeState {
  status: FreezeStatus;
  startedAt?: number;
  strategy?: FreezeStrategy;
  diagnostics?: FreezeDiagnostics;
}
