import { STABILITY_WINDOW_MS } from "@shared/constants";
import type { FreezeDiagnostics, FreezeState, FreezeStrategy } from "@shared/types";
import { isNewsCleanUi } from "../overlay/overlay";

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
  private mutationsObserved = 0;
  private pausedMedia: HTMLMediaElement[] = [];
  private frozenFrames: HTMLIFrameElement[] = [];
  private timerPatchInstalled = false;
  private restoreTimerFns: (() => void) | null = null;
  private readonly patchedIntervals = new Set<number>();

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
    this.neutralizeTimers();
    this.freezeFrames();

    return new Promise((resolve) => {
      let installed = false;
      try {
        this.installStabilityMonitor(() => {
          const durationMs = Math.round(performance.now() - started);
          this.state = { status: "FROZEN", startedAt: Date.now(), strategy: mode };
          resolve({
            success: true,
            strategy: mode,
            stabilityReached: true,
            durationMs,
            mutationsObserved: this.mutationsObserved,
            degraded: false,
          });
        });
        installed = true;
      } catch {
        // The page prevented the MutationObserver from installing (e.g. a
        // hostile script shadowing the global). Mark it in diagnostics and
        // freeze immediately — the DOM is stable enough by best effort.
        this.observerBlocked = true;
      }
      if (!installed) {
        const durationMs = Math.round(performance.now() - started);
        this.state = { status: "DEGRADED", startedAt: Date.now(), strategy: mode };
        resolve({
          success: true,
          strategy: mode,
          stabilityReached: false,
          durationMs,
          mutationsObserved: 0,
          degraded: true,
        });
      }
    });
  }

  async unfreeze(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    if (this.stabilityTimer !== null) window.clearTimeout(this.stabilityTimer);
    this.stabilityTimer = null;

    this.styleElement?.remove();
    this.styleElement = null;

    for (const media of this.pausedMedia) {
      media.play().catch(() => undefined);
    }
    this.pausedMedia = [];

    for (const frame of this.frozenFrames) {
      frame.style.removeProperty("pointer-events");
    }
    this.frozenFrames = [];

    this.restoreTimerFns?.();
    this.restoreTimerFns = null;
    this.timerPatchInstalled = false;

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

  /**
   * Stops repeating timers while frozen. Carousels, ad tickers, and refresh
   * loops are driven by setInterval — the most common source of motion that the
   * CSS freeze cannot stop (it only covers CSS animations/transitions). The
   * patch cancels new intervals the page schedules and is fully restored on
   * unfreeze. One-shot setTimeout and requestAnimationFrame are left alone:
   * blocking them can break a page's core rendering, and they don't repeat.
   */
  private neutralizeTimers(): void {
    if (this.timerPatchInstalled) return;
    const win = window as unknown as Record<string, unknown>;
    const origSetInterval = window.setInterval;
    const origClearInterval = window.clearInterval;

    const patchedSetInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
      const id = origSetInterval(handler, timeout, ...args);
      this.patchedIntervals.add(id);
      origClearInterval(id);
      return id;
    }) as typeof setInterval;

    win.setInterval = patchedSetInterval;
    this.timerPatchInstalled = true;
    this.restoreTimerFns = () => {
      win.setInterval = origSetInterval;
      win.clearInterval = origClearInterval;
      this.patchedIntervals.clear();
    };
  }

  /** Blocks interaction with embedded frames so they can't re-render or move. */
  private freezeFrames(): void {
    this.frozenFrames = Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe")).filter(
      (frame) => !isNewsCleanUi(frame),
    );
    for (const frame of this.frozenFrames) {
      frame.style.setProperty("pointer-events", "none", "important");
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
