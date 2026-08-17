import { STABILITY_WINDOW_MS } from "@shared/constants";
import type { FreezeDiagnostics, FreezeState, FreezeStrategy } from "@shared/types";

/**
 * Freeze Engine — stabilizes a dynamic page into a controlled working DOM.
 * Responsibility ends at `Dynamic Page → Stable Working Page`. It does not
 * clean, decide relevance, or capture.
 *
 * Soft Freeze (default): stop pending loads (best effort), disable visual
 * motion, pause media, monitor remaining mutations until a stable window.
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
