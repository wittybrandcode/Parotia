import { MAX_FREEZE_WAIT_MS, STABILITY_WINDOW_MS } from "@shared/constants";
import type { FreezeDiagnostics, FreezeState, FreezeStrategy } from "@shared/types";
import { isParotiaUi } from "../overlay/overlay";

/**
 * Freeze Engine — stabilizes a dynamic page into a controlled working DOM.
 * Responsibility ends at `Dynamic Page → Stable Working Page`. It does not
 * clean, decide relevance, or capture.
 *
 * Soft Freeze (default): stop pending loads (best effort), disable visual
 * motion, pause media, stop repeating timers (carousels/tickers), block
 * embedded-frame interaction, and monitor remaining mutations until a stable
 * window. Everything is fully restored on unfreeze.
 */

export interface FreezeResult {
  success: boolean;
  strategy: FreezeStrategy;
  stabilityReached: boolean;
  durationMs: number;
  mutationsObserved: number;
  degraded: boolean;
}

export interface FreezeEngine {
  freeze(mode?: FreezeStrategy): Promise<FreezeResult>;
  unfreeze(): Promise<void>;
  getState(): FreezeState;
  getDiagnostics(): FreezeDiagnostics;
}

const FREEZE_STYLES = `
  * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
`;

export class DefaultFreezeEngine implements FreezeEngine {
  private state: FreezeState = { status: "UNFROZEN" };
  private styleElement: HTMLStyleElement | null = null;
  private observer: MutationObserver | null = null;
  private observerBlocked = false;
  private stabilityTimer: number | null = null;
  private hardDeadlineTimer: number | null = null;
  private mutationsObserved = 0;
  private pausedMedia: HTMLMediaElement[] = [];
  private frozenFrames: Array<{ frame: HTMLIFrameElement; value: string; priority: string }> = [];

  freeze(mode: FreezeStrategy = "SOFT_FREEZE"): Promise<FreezeResult> {
    if (this.state.status === "FROZEN") {
      return Promise.resolve({
        success: true,
        strategy: mode,
        stabilityReached: true,
        durationMs: 0,
        mutationsObserved: this.mutationsObserved,
        degraded: false,
      });
    }

    const started = performance.now();
    this.state = { status: "FREEZING", startedAt: Date.now(), strategy: mode };
    this.mutationsObserved = 0;

    window.stop(); // best-effort: stop pending navigation / loads.

    this.injectFreezeStyles();
    this.pauseMedia();
    this.freezeFrames();

    return new Promise((resolve) => {
      let installed = false;
      let settled = false;
      const finish = (stabilityReached: boolean, degraded: boolean): void => {
        if (settled) return;
        settled = true;
        if (this.hardDeadlineTimer !== null) window.clearTimeout(this.hardDeadlineTimer);
        this.hardDeadlineTimer = null;
        if (!stabilityReached) {
          if (typeof this.observer?.disconnect === "function") this.observer.disconnect();
          this.observer = null;
        }
        const durationMs = Math.round(performance.now() - started);
        this.state = {
          status: degraded ? "DEGRADED" : "FROZEN",
          startedAt: Date.now(),
          strategy: mode,
        };
        resolve({
          success: true,
          strategy: mode,
          stabilityReached,
          durationMs,
          mutationsObserved: this.mutationsObserved,
          degraded,
        });
      };
      try {
        this.installStabilityMonitor(() => finish(true, false));
        this.hardDeadlineTimer = window.setTimeout(
          () => finish(false, true),
          MAX_FREEZE_WAIT_MS,
        );
        installed = true;
      } catch {
        // The page prevented the MutationObserver from installing (e.g. a
        // hostile script shadowing the global). Mark it in diagnostics and
        // freeze immediately — the DOM is stable enough by best effort.
        this.observerBlocked = true;
      }
      if (!installed) {
        finish(false, true);
      }
    });
  }

  async unfreeze(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    if (this.stabilityTimer !== null) window.clearTimeout(this.stabilityTimer);
    this.stabilityTimer = null;
    if (this.hardDeadlineTimer !== null) window.clearTimeout(this.hardDeadlineTimer);
    this.hardDeadlineTimer = null;

    this.styleElement?.remove();
    this.styleElement = null;

    for (const media of this.pausedMedia) {
      media.play().catch(() => undefined);
    }
    this.pausedMedia = [];

    for (const record of this.frozenFrames) {
      if (record.value === "") record.frame.style.removeProperty("pointer-events");
      else record.frame.style.setProperty("pointer-events", record.value, record.priority);
    }
    this.frozenFrames = [];

    this.state = { status: "UNFROZEN" };
    this.observerBlocked = false;
  }

  getState(): FreezeState {
    return { ...this.state };
  }

  getDiagnostics(): FreezeDiagnostics {
    return {
      animationCount: activeMotionCount("animation-name", "none"),
      transitionCount: activeMotionCount("transition-duration", "0s"),
      mediaCount: this.pausedMedia.length,
      // `true` only when the page actively blocked observer install during a
      // freeze; an idle (unfrozen) engine has no observer and reports false.
      mutationObserverBlocked: this.observerBlocked,
      pendingNetworkActivity: document.readyState !== "complete",
    };
  }

  private injectFreezeStyles(): void {
    if (this.styleElement) return;
    const style = document.createElement("style");
    style.setAttribute("data-newsclean-freeze", "true");
    style.textContent = FREEZE_STYLES;
    (document.head ?? document.documentElement).appendChild(style);
    this.styleElement = style;
  }

  private pauseMedia(): void {
    this.pausedMedia = Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio")).filter(
      (m) => !m.paused,
    );
    for (const media of this.pausedMedia) media.pause();
  }

  /** Blocks interaction with embedded frames so they can't re-render or move. */
  private freezeFrames(): void {
    this.frozenFrames = Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe"))
      .filter((frame) => !isParotiaUi(frame))
      .map((frame) => ({
        frame,
        value: frame.style.getPropertyValue("pointer-events"),
        priority: frame.style.getPropertyPriority("pointer-events"),
      }));
    for (const record of this.frozenFrames) {
      record.frame.style.setProperty("pointer-events", "none", "important");
    }
  }

  /**
   * Stability monitor: a MutationObserver resets a stability timer on relevant
   * structural/visual mutations. When the DOM stays quiet for
   * STABILITY_WINDOW_MS, the page is declared FROZEN.
   */
  private installStabilityMonitor(onStable: () => void): void {
    this.observer = new MutationObserver((records) => {
      this.mutationsObserved += records.length;
      this.resetStabilityTimer(onStable);
    });
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    this.resetStabilityTimer(onStable);
  }

  private resetStabilityTimer(onStable: () => void): void {
    if (this.stabilityTimer !== null) window.clearTimeout(this.stabilityTimer);
    this.stabilityTimer = window.setTimeout(onStable, STABILITY_WINDOW_MS);
  }
}

/** Counts elements running a CSS animation or transition, for diagnostics. */
function activeMotionCount(property: string, idleValue: string): number {
  let count = 0;
  try {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      let value: string;
      try {
        value = getComputedStyle(el).getPropertyValue(property).trim().toLowerCase();
      } catch {
        value = "";
      }
      if (value === "") value = el.style.getPropertyValue(property).trim().toLowerCase();
      if (value !== "" && value !== idleValue) count += 1;
    }
  } catch {
    return 0;
  }
  return count;
}
