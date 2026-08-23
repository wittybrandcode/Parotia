import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ActionLogEntry,
  BackgroundCommand,
  CaptureProgress,
  CleanupState,
  FreezeState,
  MessageResponse,
} from "@shared/types";
import { CONTENT_MESSAGE_SOURCE, LEGACY_CONTENT_MESSAGE_SOURCE } from "@shared/constants";
import {
  BoxSelect,
  Camera,
  CircleX,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Loader2,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { ParotiaLogo } from "./brand";

export interface ToolbarState {
  sessionId: string | null;
  status: string;
  freeze: FreezeState | null;
  cleanup: CleanupState | null;
  actionLog: ActionLogEntry[];
  /** Undo/redo availability, driven live by the session history stacks. */
  history?: { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string };
}

interface ContentBroadcast {
  source?: string;
  type?: string;
  state?: ToolbarState;
  progress?: CaptureProgress;
}

type StateResponse = { success?: boolean; data?: ToolbarState | null };

type CommandResult = {
  success?: boolean;
  error?: { message?: string };
  data?: Record<string, unknown> | null;
};

function sendCommand(command: Omit<BackgroundCommand, "id">): Promise<unknown> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    chrome.runtime.sendMessage({ ...command, id } as BackgroundCommand, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

interface IconButtonProps {
  label: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  primary?: boolean;
  danger?: boolean;
}

function IconButton({ label, title, icon, onClick, disabled, active, primary, danger }: IconButtonProps) {
  const className = [
    "nc-btn",
    primary ? "nc-btn-primary" : "",
    danger ? "nc-btn-danger" : "",
    active ? "nc-btn-active" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={className} title={title} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
      <span className="nc-btn-label">{label}</span>
    </button>
  );
}

/** Compact relative time label for the action log ("just now", "3m ago"). */
function relativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Live capture status, e.g. "Capture rendering 3/5 (60%)". */
function progressLabel(progress: CaptureProgress): string {
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  return `Capture ${progress.phase.toLowerCase()} ${progress.current}/${progress.total} (${pct}%)`;
}

export function App() {
  const bootstrapParams = (() => {
    try {
      const value = window.location.hash.slice(1);
      const parsed = value
        ? JSON.parse(decodeURIComponent(value)) as { sessionId?: unknown; parentOrigin?: unknown }
        : {};
      return {
        sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
        parentOrigin: typeof parsed.parentOrigin === "string" ? new URL(parsed.parentOrigin).origin : "",
      };
    } catch {
      return { sessionId: "", parentOrigin: "" };
    }
  })();
  const bootstrapSessionId = bootstrapParams.sessionId;
  const bootstrapParentOrigin = bootstrapParams.parentOrigin;
  const [state, setState] = useState<ToolbarState>({
    sessionId: null,
    status: "CREATED",
    freeze: null,
    cleanup: null,
    actionLog: [],
    history: { canUndo: false, canRedo: false },
  });
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  // While a capture is in flight, STATE broadcasts must not clear the live
  // progress feedback; once it ends, the next STATE clears the stale message.
  const capturingRef = useRef(false);

  const applyState = useCallback((next: ToolbarState | null | undefined) => {
    if (!next) return;
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const run = useCallback(
    async (
      command: Omit<BackgroundCommand, "id">,
      then?: (ok: boolean) => void,
    ): Promise<Record<string, unknown> | null | undefined> => {
      setBusy(true);
      if (command.type === "CAPTURE") setFeedback({ ok: true, text: "Capturing…" });
      try {
        const res = (await sendCommand(command)) as CommandResult | undefined;
        const data = res?.data;
        const dataOk = (data as { success?: boolean } | undefined)?.success;
        // Transport success is always true; the real result lives in data.success.
        const ok = (res?.success ?? false) && (dataOk === undefined ? true : dataOk);
        if (!ok) {
          const message =
            (typeof data?.error === "string"
              ? data.error
              : (data?.error as { message?: string } | undefined)?.message) ??
            res?.error?.message ??
            "Operation failed";
          setFeedback({ ok: false, text: message });
        } else if (command.type === "CAPTURE") {
          setFeedback({ ok: true, text: `Saved: ${(data as { filename?: string }).filename ?? "parotia.png"}` });
        }
        then?.(ok);
        // Sync the toolbar with the latest session state after every action.
        const stateRes = (await sendCommand({
          type: "GET_STATE",
          payload: { sessionId: state.sessionId ?? "" },
        })) as StateResponse | undefined;
        applyState(stateRes?.data);
        return data;
      } finally {
        if (command.type === "CAPTURE") capturingRef.current = false;
        setBusy(false);
      }
    },
    [state.sessionId, applyState],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent<ContentBroadcast>) => {
      // STATE broadcasts must come from the page that hosts this toolbar
      // (the content script posts through the page's own window). Anything
      // arriving from an external window is spoofed and ignored.
      if (event.source !== window.parent) return;
      if (!bootstrapParentOrigin || event.origin !== bootstrapParentOrigin) return;
      const broadcast = event.data;
      if (broadcast?.source !== CONTENT_MESSAGE_SOURCE && broadcast?.source !== LEGACY_CONTENT_MESSAGE_SOURCE) return;
      if (broadcast.type === "PROGRESS") {
        if (!broadcast.progress) return;
        // A capture started: show live progress and keep STATE broadcasts
        // from clearing it until the capture resolves.
        capturingRef.current = true;
        setFeedback({ ok: true, text: progressLabel(broadcast.progress) });
        return;
      }
      if (broadcast.type === "STATE") {
        // A fresh state means a new operation settled — clear stale feedback
        // (e.g. the previous capture's "Saved" message) unless still capturing.
        if (!capturingRef.current) setFeedback(null);
        applyState(broadcast.state);
      }
    };
    window.addEventListener("message", onMessage);

    // Bootstrap: the toolbar starts its own session so every button works
    // immediately, without requiring a separate click on the extension icon.
    void (async () => {
      if (!bootstrapSessionId) return;
      const res = (await sendCommand({
        type: "START_SESSION",
        payload: { sessionId: bootstrapSessionId },
      })) as { data?: MessageResponse<ToolbarState> | ToolbarState } | undefined;
      const data = res?.data;
      if (data && "success" in data) applyState(data.data);
      else applyState(data);
    })();

    return () => window.removeEventListener("message", onMessage);
  }, [applyState, bootstrapParentOrigin, bootstrapSessionId]);

  const freezeStatus = state.freeze?.status ?? "UNFROZEN";
  const frozen = freezeStatus !== "UNFROZEN";
  const fullyFrozen = freezeStatus === "FROZEN" || freezeStatus === "DEGRADED";
  const removed = state.cleanup?.removedCount ?? 0;
  const selectedHidden = state.cleanup?.selectedHidden ?? false;
  const sessionId = state.sessionId ?? "";

  const toggleFreeze = async () => {
    // Freezing starts the cleaning; the Parotia keeps dancing until unfreeze.
    await run(
      frozen
        ? { type: "UNFREEZE_PAGE", payload: { sessionId } }
        : { type: "FREEZE_PAGE", payload: { sessionId } },
    );
  };

  const togglePick = async () => {
    const data = await run({ type: "INSPECT_START", payload: { sessionId } });
    setInspecting(Boolean((data as { active?: boolean } | undefined)?.active));
  };

  const doCapture = async () => {
    await run({ type: "CAPTURE", payload: { sessionId, mode: "FULL_PAGE" } });
    // Capture always stops the picker so no highlight appears in the image.
    setInspecting(false);
  };

  const doFreeSelect = async () => {
    await run({ type: "CAPTURE", payload: { sessionId, mode: "REGION" } });
    setInspecting(false);
  };

  return (
    <div className="nc-toolbar" data-newsclean-ui="true">
      <button
        type="button"
        className="nc-brand"
        title={
          frozen
            ? "Unfreeze — resume the live page (Shift+Alt+F)"
            : "Freeze the page against live updates (Shift+Alt+F)"
        }
        aria-label={frozen ? "Unfreeze the page" : "Freeze the page"}
        aria-pressed={frozen}
        disabled={busy || !state.sessionId}
        onClick={() => void toggleFreeze()}
      >
        <span
          className={`nc-logo${frozen ? " nc-logo-frozen nc-logo-dancing" : ""}`}
          aria-hidden="true"
        >
          <ParotiaLogo />
        </span>
        <span className="nc-title">PAROTIA</span>
      </button>

      <div className="nc-groups">
        <div className="nc-group">
          <IconButton
            label="Pick"
              title="Pick elements to clean — toggle (Shift+Alt+P)"
              icon={<Crosshair size={18} />}
              active={inspecting}
              disabled={busy || !state.sessionId || !fullyFrozen}
              onClick={() => void togglePick()}
            />
          </div>

          <div className="nc-group">
            <IconButton
              label="Delete"
              title="Delete the picked element (Delete while picking)"
              icon={<Trash2 size={18} />}
              danger
              disabled={busy || !fullyFrozen}
              onClick={() => void run({ type: "DELETE_ELEMENT", payload: { sessionId } })}
            />
            <IconButton
              label={selectedHidden ? "Show" : "Hide"}
              title={selectedHidden ? "Show the selected element again" : "Hide the selected element"}
              icon={selectedHidden ? <Eye size={18} /> : <EyeOff size={18} />}
              disabled={busy || !fullyFrozen}
              onClick={() =>
                void run({
                  type: selectedHidden ? "SHOW_ELEMENT" : "HIDE_ELEMENT",
                  payload: { sessionId, elementId: "" },
                })
              }
            />
          </div>

          <div className="nc-group">
            <IconButton
              label="Capture"
              title="Capture the whole article as a PNG"
              icon={<Camera size={18} />}
              primary
              disabled={busy || !state.sessionId}
              onClick={() => void doCapture()}
            />
            <IconButton
              label="Select"
              title="Select a region on the page to capture"
              icon={<BoxSelect size={18} />}
              disabled={busy || !state.sessionId}
              onClick={() => void doFreeSelect()}
            />
            <IconButton
              label="History"
              title="Show the session action log"
              icon={<History size={18} />}
              active={logOpen}
              disabled={busy || !state.sessionId}
              onClick={() => setLogOpen((v) => !v)}
            />
            <IconButton
              label="Undo"
              title={state.history?.undoLabel ? `Undo "${state.history.undoLabel}"` : "Undo the last cleanup action"}
              icon={<Undo2 size={18} />}
              disabled={busy || !state.history?.canUndo}
              onClick={() => void run({ type: "UNDO", payload: { sessionId } })}
            />
            <IconButton
              label="Redo"
              title={state.history?.redoLabel ? `Redo "${state.history.redoLabel}"` : "Redo the last undone action"}
              icon={<Redo2 size={18} />}
              disabled={busy || !state.history?.canRedo}
              onClick={() => void run({ type: "REDO", payload: { sessionId } })}
            />
            <IconButton
              label="Reset"
              title="Restore all removed and hidden elements"
              icon={<RotateCcw size={18} />}
              disabled={busy}
              onClick={() => {
                if (window.confirm("Restore all removed and hidden elements?")) {
                  void run({ type: "RESET", payload: { sessionId } });
                }
              }}
            />
          </div>
        </div>

        <div className="nc-side">
          <div className="nc-feedback" data-feedback-ok={feedback?.ok}>
            {busy && <Loader2 className="nc-spin" size={11} aria-hidden="true" />}
            <span>{feedback ? feedback.text : `Removed ${removed} element${removed === 1 ? "" : "s"}`}</span>
            <a
              className="nc-inline-icon"
              href={chrome.runtime.getURL("ui/options.html")}
              target="_blank"
              rel="noopener noreferrer"
              title="Settings"
              aria-label="Open Parotia settings"
            >
              <ExternalLink size={13} />
            </a>
            <button
              type="button"
              className="nc-inline-icon"
              title="Close Parotia"
              aria-label="Close Parotia"
              onClick={() => void run({ type: "CLOSE_TOOLBAR", payload: { sessionId } })}
            >
              <CircleX size={14} />
            </button>
          </div>
        </div>

      {logOpen && (
        <div className="nc-panel" aria-live="polite">
          <div className="nc-panel-head">
            <span>Action Log</span>
            <span className="nc-panel-count">{state.actionLog.length} entries</span>
          </div>
          {state.actionLog.length === 0 ? (
            <div className="nc-panel-empty">No actions yet — clean an element to start the log.</div>
          ) : (
            <ul className="nc-panel-list nc-log-list">
              {state.actionLog.map((entry) => (
                <li key={entry.id} className="nc-log-item" data-undoable={entry.undoable}>
                  <span className="nc-log-label" title={entry.label}>
                    {entry.label}
                  </span>
                  <span className="nc-log-time">{relativeTime(entry.at)}</span>
                  {entry.undoable && (
                    <button
                      type="button"
                      className="nc-log-undo"
                      title="Undo just this action"
                      disabled={busy}
                      onClick={() => void run({ type: "UNDO_TO", payload: { sessionId, entryId: entry.id } })}
                    >
                      <Undo2 size={12} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
