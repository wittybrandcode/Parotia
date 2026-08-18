import type {
  CleanupState,
  FreezeState,
  InspectionState,
  NewsCleanSession,
  PageContext,
  SessionStatus,
} from "@shared/types";
import { SESSION_TRANSITIONS } from "@shared/types";
import { createId } from "@shared/utils/id";

const EMPTY_CLEANUP: CleanupState = {
  removedCount: 0,
  hiddenCount: 0,
  activeRules: [],
  selectedHidden: false,
};

const EMPTY_INSPECTION: InspectionState = { active: false, mode: "IDLE" };

export function createSession(page: PageContext): NewsCleanSession {
  return {
    id: createId("nc-session"),
    createdAt: page.startedAt,
    page,
    freeze: { status: "UNFROZEN" },
    extraction: { status: "NOT_RUN" },
    inspection: { ...EMPTY_INSPECTION },
    cleanup: { ...EMPTY_CLEANUP },
    capture: { status: "IDLE" },
    status: "CREATED",
  };
}

export function currentPageContext(): PageContext {
  return {
    url: location.href,
    hostname: location.hostname,
    pathname: location.pathname,
    title: document.title,
    startedAt: Date.now(),
  };
}

/** Transition the session to `next`, rejecting invalid moves. */
export function transitionSession(session: NewsCleanSession, next: SessionStatus): boolean {
  const allowed = SESSION_TRANSITIONS[session.status];
  if (!allowed.includes(next)) return false;
  session.status = next;
  return true;
}

export function updateFreeze(session: NewsCleanSession, freeze: FreezeState): void {
  session.freeze = freeze;
}
