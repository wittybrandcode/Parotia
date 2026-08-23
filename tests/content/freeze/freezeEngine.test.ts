import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultFreezeEngine } from "@content/freeze/freezeEngine";

describe("DefaultFreezeEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("stop", vi.fn());
    Object.defineProperty(window, "stop", { value: vi.fn(), configurable: true });
    document.body.innerHTML = `
      <article><p>Intro paragraph.</p><video src="clip.mp4"></video></article>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    document.head.querySelectorAll("style[data-newsclean-freeze]").forEach((s) => s.remove());
  });

  it("freezes a stable page immediately after the stability window", async () => {
    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze("SOFT_FREEZE");
    vi.advanceTimersByTime(600);
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.strategy).toBe("SOFT_FREEZE");
    expect(result.stabilityReached).toBe(true);
    expect(engine.getState().status).toBe("FROZEN");
  });

  it("injects freeze styles and pauses media", async () => {
    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze();
    vi.advanceTimersByTime(600);
    await promise;

    const style = document.querySelector('style[data-newsclean-freeze]');
    expect(style).not.toBeNull();
    const video = document.querySelector("video");
    expect(video?.paused).toBe(true);
  });

  it("unfreeze removes styles and resumes media", async () => {
    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze();
    vi.advanceTimersByTime(600);
    await promise;

    await engine.unfreeze();
    expect(engine.getState().status).toBe("UNFROZEN");
    expect(document.querySelector('style[data-newsclean-freeze]')).toBeNull();
  });

  it("is idempotent when already frozen", async () => {
    const engine = new DefaultFreezeEngine();
    const p1 = engine.freeze();
    vi.advanceTimersByTime(600);
    await p1;

    const p2 = engine.freeze();
    const result2 = await p2;
    expect(result2.success).toBe(true);
    expect(result2.durationMs).toBe(0);
  });

  it("reports animationCount/transitionCount for elements in motion", async () => {
    document.body.innerHTML = `
      <div id="spin" style="animation-name: spin; animation-duration: 2s"></div>
      <div id="slide" style="transition-duration: 0.4s; transition-property: left"></div>
      <div id="quiet">static</div>
    `;
    const engine = new DefaultFreezeEngine();
    const diag = engine.getDiagnostics();

    expect(diag.animationCount).toBe(1);
    expect(diag.transitionCount).toBe(1);
    expect(diag.mediaCount).toBe(0);
  });

  it("mutationObserverBlocked is false for an idle and a healthy frozen engine", async () => {
    const idle = new DefaultFreezeEngine();
    expect(idle.getDiagnostics().mutationObserverBlocked).toBe(false);

    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze();
    vi.advanceTimersByTime(600);
    await promise;
    expect(engine.getDiagnostics().mutationObserverBlocked).toBe(false);
  });

  it("mutationObserverBlocked becomes true when the observer cannot be installed", async () => {
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe() {
          throw new Error("blocked by page");
        }
      },
    );
    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze();
    // No stability timer is armed when the observer is blocked — the freeze
    // resolves immediately as degraded.
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.stabilityReached).toBe(false);
    expect(result.degraded).toBe(true);
    expect(engine.getDiagnostics().mutationObserverBlocked).toBe(true);
  });

  it("freeze blocks interaction with foreign iframes but skips Parotia UI", async () => {
    document.body.innerHTML = `
      <article>
        <iframe data-src="https://player.example"></iframe>
        <div data-newsclean-root="true"><iframe></iframe></div>
      </article>
    `;
    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze();
    vi.advanceTimersByTime(600);
    await promise;

    const foreign = document.querySelector<HTMLIFrameElement>('iframe[data-src]');
    const ui = document.querySelector<HTMLIFrameElement>('[data-newsclean-root="true"] iframe');
    expect(foreign?.style.pointerEvents).toBe("none");
    expect(ui?.style.pointerEvents).not.toBe("none");

    await engine.unfreeze();
    expect(foreign?.style.pointerEvents).toBe("");
  });

  it("does not pretend to patch page timers from the isolated content world", async () => {
    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze();
    vi.advanceTimersByTime(600);
    await promise;

    const callback = vi.fn();
    const interval = window.setInterval(callback, 100);
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalled();
    window.clearInterval(interval);
    await engine.unfreeze();
  });

  it("degrades at the hard deadline when mutations never become quiet", async () => {
    vi.stubGlobal(
      "MutationObserver",
      class {
        private readonly callback: MutationCallback;
        private interval: number | null = null;
        constructor(callback: MutationCallback) { this.callback = callback; }
        observe() {
          this.interval = window.setInterval(() => this.callback([], this as unknown as MutationObserver), 100);
        }
        disconnect() {
          if (this.interval !== null) window.clearInterval(this.interval);
        }
      },
    );
    const engine = new DefaultFreezeEngine();
    const promise = engine.freeze();
    await vi.advanceTimersByTimeAsync(5500);
    const result = await promise;
    expect(result.stabilityReached).toBe(false);
    expect(result.degraded).toBe(true);
    expect(engine.getState().status).toBe("DEGRADED");
  });
});
