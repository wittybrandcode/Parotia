import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type ToolbarState } from "@ui/src/App";

const baseState: ToolbarState = {
  sessionId: "s0",
  status: "ACTIVE",
  freeze: { status: "UNFROZEN" },
  cleanup: {
    removedCount: 0,
    hiddenCount: 0,
    keptCount: 0,
    activeRules: [],
    protectedTargets: [],
    selectedHidden: false,
  },
  preset: null,
  actionLog: [],
  history: { canUndo: false, canRedo: false },
};

const frozenState: ToolbarState = {
  ...baseState,
  freeze: { status: "FROZEN" },
  cleanup: {
    removedCount: 3,
    hiddenCount: 0,
    keptCount: 0,
    activeRules: [],
    protectedTargets: [],
    selectedHidden: false,
  },
  history: { canUndo: true, canRedo: false, undoLabel: "Delete .ad" },
};

/** Mirrors the content-script STATE broadcast the toolbar listens for. */
function broadcast(state: ToolbarState) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "newsclean-content", type: "STATE", state },
      source: window.parent,
      origin: "https://page.example",
    }),
  );
}

/** Mirrors the content-script CAPTURE_PROGRESS relay the toolbar listens for. */
function broadcastProgress(progress: { current: number; total: number; phase: string }) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "newsclean-content", type: "PROGRESS", progress },
      source: window.parent,
      origin: "https://page.example",
    }),
  );
}

/** Installs a chrome.runtime.sendMessage handler that calls back synchronously. */
function installSendMessage(
  handler: (message: { type: string; payload?: unknown }) => unknown,
) {
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(
    ((message: { type: string; payload?: unknown }, callback?: (response: unknown) => void) => {
      callback?.(handler(message));
    }) as never,
  );
}

function statefulHandler(message: { type: string }) {
  if (message.type === "START_SESSION" || message.type === "GET_STATE") {
    return { success: true, data: baseState };
  }
  return { success: true, data: { success: true } };
}

describe("ui toolbar App", () => {
  beforeEach(() => {
    vi.mocked(chrome.runtime.sendMessage).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("boots a session on mount and renders the toolbar shell", async () => {
    installSendMessage(statefulHandler);
    render(<App />);

    expect(await screen.findByText("PAROTIA")).toBeInTheDocument();
    expect(screen.getByText("UNFROZEN")).toBeInTheDocument();
    expect(screen.getByText("Removed 0 elements")).toBeInTheDocument();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "START_SESSION" }),
      expect.any(Function),
    );
    expect(screen.getByRole("button", { name: "Capture" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("keeps session-bound actions disabled until the session is ready", async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation((() => undefined) as never);
    render(<App />);

    expect(await screen.findByText("PAROTIA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Freeze the page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pick" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Capture" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "History" })).toBeDisabled();
    // Reset stays available even without a session (sends RESET with the empty session id).
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
  });

  it("applies a STATE broadcast and lets the user unfreeze the page", async () => {
    installSendMessage(statefulHandler);
    render(<App />);
    await waitFor(() => expect(screen.getByText("UNFROZEN")).toBeInTheDocument());

    broadcast(frozenState);
    await waitFor(() => expect(screen.getByText("FROZEN")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Removed 3 elements")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Pick" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Unfreeze the page" }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "UNFREEZE_PAGE", payload: { sessionId: "s0" } }),
        expect.any(Function),
      ),
    );
  });

  it("ignores a STATE broadcast that does not come from the hosting page window", async () => {
    installSendMessage(statefulHandler);
    render(<App />);
    await waitFor(() => expect(screen.getByText("UNFROZEN")).toBeInTheDocument());

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "newsclean-content", type: "STATE", state: frozenState },
        source: null,
        origin: "https://evil.example",
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("UNFROZEN")).toBeInTheDocument();
    expect(screen.queryByText("FROZEN")).not.toBeInTheDocument();
  });

  it("shows live capture progress and keeps it while STATE broadcasts arrive mid-capture", async () => {
    installSendMessage(statefulHandler);
    render(<App />);
    await waitFor(() => expect(screen.getByText("UNFROZEN")).toBeInTheDocument());

    broadcastProgress({ current: 2, total: 4, phase: "RENDERING" });
    await waitFor(() => expect(screen.getByText("Capture rendering 2/4 (50%)")).toBeInTheDocument());

    // A STATE arriving mid-capture (e.g. the PREPARE_CAPTURE broadcast) must
    // not clear the live progress feedback.
    broadcast(frozenState);
    await waitFor(() => expect(screen.getByText("FROZEN")).toBeInTheDocument());
    expect(screen.getByText("Capture rendering 2/4 (50%)")).toBeInTheDocument();
  });

  it("clears stale capture feedback once a fresh STATE arrives after the capture settles", async () => {
    installSendMessage(statefulHandler);
    render(<App />);
    await waitFor(() => expect(screen.getByText("UNFROZEN")).toBeInTheDocument());

    broadcastProgress({ current: 4, total: 4, phase: "ENCODING" });
    await waitFor(() => expect(screen.getByText("Capture encoding 4/4 (100%)")).toBeInTheDocument());

    // The capture resolves (feedback "Saved: …", capturing ends).
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await waitFor(() => expect(screen.getByText(/Saved: /)).toBeInTheDocument());

    // Any later operation's STATE clears the stale capture message.
    broadcast(frozenState);
    await waitFor(() => expect(screen.queryByText(/Saved: /)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(/Capture encoding/)).not.toBeInTheDocument());
    expect(screen.getByText("Removed 3 elements")).toBeInTheDocument();
  });

  it("sends CAPTURE in FULL_PAGE mode", async () => {
    installSendMessage(statefulHandler);
    render(<App />);
    await waitFor(() => expect(screen.getByText("UNFROZEN")).toBeInTheDocument());

    broadcast(frozenState);
    await waitFor(() => expect(screen.getByText("FROZEN")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "CAPTURE", payload: { sessionId: "s0", mode: "FULL_PAGE" } }),
        expect.any(Function),
      ),
    );
  });

  it("opens the action log and can undo a specific entry", async () => {
    installSendMessage(statefulHandler);
    render(<App />);
    await waitFor(() => expect(screen.getByText("UNFROZEN")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("No actions yet — clean an element to start the log.")).toBeInTheDocument();

    const logState: ToolbarState = {
      ...baseState,
      actionLog: [{ id: "a1", label: "Delete .ad", at: Date.now(), undoable: true }],
      history: { canUndo: true, canRedo: false, undoLabel: "Delete .ad" },
    };
    broadcast(logState);
    await waitFor(() => expect(screen.getByText("1 entries")).toBeInTheDocument());
    expect(screen.getByText("Delete .ad")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo just this action" }));
    await waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "UNDO_TO", payload: { sessionId: "s0", entryId: "a1" } }),
        expect.any(Function),
      ),
    );
  });
});
