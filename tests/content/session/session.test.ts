import { describe, expect, it } from "vitest";
import { createSession, transitionSession } from "@content/session/session";
import type { PageContext } from "@shared/types";

function page(): PageContext {
  return {
    url: "https://example.com/story",
    hostname: "example.com",
    pathname: "/story",
    title: "Story",
    startedAt: Date.now(),
  };
}

describe("createSession", () => {
  it("creates a session with defaults and a unique id", () => {
    const session = createSession(page());
    expect(session.status).toBe("CREATED");
    expect(session.freeze.status).toBe("UNFROZEN");
    expect(session.capture.status).toBe("IDLE");
    expect(session.cleanup.removedCount).toBe(0);
    expect(session.page.url).toBe("https://example.com/story");
  });
});

describe("transitionSession", () => {
  it("follows the declared lifecycle", () => {
    const session = createSession(page());
    expect(transitionSession(session, "INITIALIZING")).toBe(true);
    expect(transitionSession(session, "ACTIVE")).toBe(true);
    expect(session.status).toBe("ACTIVE");
  });

  it("rejects invalid transitions", () => {
    const session = createSession(page());
    expect(transitionSession(session, "COMPLETED")).toBe(false);
    expect(session.status).toBe("CREATED");
  });

  it("rejects transitions out of a terminal state", () => {
    const session = createSession(page());
    transitionSession(session, "INITIALIZING");
    transitionSession(session, "ACTIVE");
    transitionSession(session, "COMPLETED");
    expect(transitionSession(session, "ACTIVE")).toBe(false);
    expect(session.status).toBe("COMPLETED");
  });
});
