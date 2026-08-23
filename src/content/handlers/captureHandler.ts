import type { BackgroundCommand } from "@shared/types";
import type { HandlerContext } from "./types";
import { DefaultCaptureStitcher } from "../capture/captureStitcher";
import { ELEMENT_EXPORT_SCALE, cropDataUrlToPng, loadBitmap, sleep } from "../capture/elementCapture";
import { exceedsCanvasLimit, MAX_CANVAS_DIMENSION } from "../capture/sliceMath";
import { forceEagerImages, preRollForCapture, waitForVisualAssets } from "../capture/preload";
import { collectImages, kickImages, waitForFonts } from "@shared/utils/media";
import type { DomPatchLedger } from "@shared/utils/domPatchLedger";
import { startFreeSelect } from "../selection/freeSelect";

/** Owns every capture-preparation mutation and makes restore idempotent. */
class CapturePreparationTransactions {
  private regionStyle: HTMLStyleElement | null = null;
  private fullPageStyle: HTMLStyleElement | null = null;
  private regionPatches: DomPatchLedger | null = null;
  private fullPagePatches: DomPatchLedger | null = null;

  async prepareRegion(): Promise<void> {
    this.restoreRegion();
    const style = document.createElement("style");
    style.textContent = `*, *::before, *::after { content-visibility: visible !important; }`;
    (document.head ?? document.documentElement).appendChild(style);
    this.regionStyle = style;
    this.regionPatches = forceEagerImages(document);

    const imgs = collectImages(document);
    const visualCandidates = document.querySelectorAll<HTMLElement>(
      "img, picture, video, canvas, svg, svg image, [style*='background']",
    );
    for (const candidate of visualCandidates) {
      let node: HTMLElement | null = candidate.parentElement;
      while (node && node !== document.documentElement && node !== document.body) {
        let opacity = 1;
        try { opacity = parseFloat(getComputedStyle(node).opacity) || 0; } catch { /* best effort */ }
        if (opacity === 0) this.regionPatches.setStyle(node, "opacity", "1", "important");
        node = node.parentElement;
      }
    }

    const pending = () => imgs.filter((image) => !image.complete || image.naturalWidth === 0);
    kickImages(pending());
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && pending().length > 0) {
      await sleep(100);
      kickImages(pending());
    }
    await waitForFonts();
    await waitForVisualAssets(document, 1000);
  }

  restoreRegion(): void {
    this.regionStyle?.remove();
    this.regionStyle = null;
    this.regionPatches?.restore();
    this.regionPatches = null;
  }

  async prepareFullPage(): Promise<void> {
    this.fullPageStyle?.remove();
    const style = document.createElement("style");
    style.setAttribute("data-parotia-full-page-capture", "true");
    style.textContent = `
      html, body {
        scroll-behavior: auto !important;
        scroll-snap-type: none !important;
        overflow-anchor: none !important;
      }
      *, *::before, *::after {
        scroll-snap-align: none !important;
        scroll-snap-stop: normal !important;
      }
    `;
    (document.head ?? document.documentElement).appendChild(style);
    this.fullPageStyle = style;
    this.fullPagePatches?.restore();
    this.fullPagePatches = forceEagerImages(document);
    await waitForVisualAssets(document);
  }

  restoreFullPage(): void {
    this.fullPageStyle?.remove();
    this.fullPageStyle = null;
    this.fullPagePatches?.restore();
    this.fullPagePatches = null;
  }
}

const preparations = new CapturePreparationTransactions();

type CaptureCommand = Extract<
  BackgroundCommand,
  | {
      type:
        | "CAPTURE" | "PREPARE_CAPTURE" | "RESTORE_CAPTURE"
        | "PREPARE_ELEMENT_CAPTURE" | "CAPTURE_ELEMENT_SCROLL"
        | "CAPTURE_ELEMENT_CROP" | "CAPTURE_ELEMENT_SLICE" | "CAPTURE_ELEMENT_FINALIZE"
        | "CAPTURE_ELEMENT_RESTORE"
        | "FREE_SELECT" | "CAPTURE_REGION_CROP"
        | "PREPARE_REGION_CAPTURE" | "RESTORE_REGION_CAPTURE"
        | "CAPTURE_STITCH_START" | "CAPTURE_SCROLL"
        | "CAPTURE_SLICE" | "CAPTURE_FINALIZE"
        | "SELECT_REGION";
    }
>;

export async function handleCaptureCommand(
  command: CaptureCommand,
  ctx: HandlerContext,
): Promise<unknown> {
  switch (command.type) {
    case "CAPTURE":
      return { success: false, error: "Capture orchestrated by Service Worker" };

    case "PREPARE_CAPTURE":
      ctx.cleanup?.stopInspecting();
      ctx.overlay?.setVisible(false);
      ctx.broadcastState();
      // Resolve only after the extension UI has left the compositor frame.
      // The worker can then capture immediately without a long delay that
      // would advance videos or animated content unnecessarily.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return { success: true };

    case "RESTORE_CAPTURE":
      ctx.overlay?.setVisible(true);
      ctx.fixedHeaders.restoreAll();
      preparations.restoreFullPage();
      return { success: true };

    case "PREPARE_ELEMENT_CAPTURE": {
      ctx.ensureRuntime();
      const ref = ctx.cleanup?.selected;
      const element = ref && ref.id === command.payload.elementId
        ? document.querySelector<HTMLElement>(ref.selector)
        : null;
      if (!element || !element.isConnected) {
        return { success: false, error: "Selected element no longer exists" };
      }
      const metrics = ctx.elementCapture.isolate(element);
      if (metrics.rect.width <= 0 || metrics.rect.height <= 0) {
        ctx.elementCapture.restore();
        return { success: false, error: "Selected element has no visible area" };
      }

      // Deliberately do not scroll, wait for lazy media, force styles, or
      // re-measure after a layout mutation. The returned rectangle describes
      // the exact frame currently painted in the viewport.
      if (exceedsCanvasLimit(metrics.elementHeightCss, metrics.dpr)) {
        ctx.elementCapture.restore();
        return {
          success: false,
          tooTall: true,
          error: `Element is too tall for capture (max ${MAX_CANVAS_DIMENSION}px)`,
        };
      }

      // Fully visible elements use a single native viewport screenshot and do
      // not need a stitcher. This is the lossless path used for visible posts.
      if (!metrics.fullyVisible) {
        ctx.stitcher?.dispose();
        const newStitcher = new DefaultCaptureStitcher();
        newStitcher.start(metrics.elementHeightCss, metrics.dpr, metrics.elementDocTop);
        ctx.stitcher = newStitcher;
      }
      return { success: true, ...metrics };
    }

    case "CAPTURE_ELEMENT_CROP": {
      try {
        const { dataUrl, rect, dpr } = command.payload;
        const cropped = await cropDataUrlToPng(dataUrl, {
          x: rect.left * dpr,
          y: rect.top * dpr,
          width: rect.width * dpr,
          height: rect.height * dpr,
        }, ELEMENT_EXPORT_SCALE);
        try {
          await chrome.storage.local.set({ [`elementcapture:${command.payload.sessionId}`]: cropped });
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: `Failed to stage element image: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    case "CAPTURE_ELEMENT_SCROLL": {
      const scroller = document.scrollingElement ?? document.documentElement;
      scroller.scrollTop = command.payload.scrollYCss;
      window.scrollTo(0, command.payload.scrollYCss);
      void document.documentElement.getBoundingClientRect();
      return { success: true, actualScrollY: window.scrollY };
    }

    case "CAPTURE_ELEMENT_SLICE": {
      if (!ctx.stitcher) return { success: false, error: "Element capture not started" };
      try {
        const { blank } = await ctx.stitcher.addSlice(command.payload.dataUrl, command.payload.scrollYCss);
        return { success: true, blank };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    case "CAPTURE_ELEMENT_FINALIZE": {
      if (!ctx.stitcher) return { success: false, error: "Element capture not started" };
      try {
        let dataUrl = await ctx.stitcher.finalize();
        const { dpr, rect } = command.payload;
        if (dpr > 0 && rect && rect.width > 0) {
          const bitmap = await loadBitmap(dataUrl);
          const vpWidth = bitmap.width;
          const vpHeight = bitmap.height;
          bitmap.close();
          const x = Math.max(0, Math.round(rect.left * dpr));
          const width = Math.max(1, Math.min(vpWidth - x, Math.round(rect.width * dpr)));
          // Always pass through one high-quality render: it performs the
          // horizontal element crop and safe 2× enlargement together.
          dataUrl = await cropDataUrlToPng(
            dataUrl,
            { x, y: 0, width, height: vpHeight },
            ELEMENT_EXPORT_SCALE,
          );
        }
        try {
          await chrome.storage.local.set({ [`elementcapture:${command.payload.sessionId}`]: dataUrl });
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: `Failed to stage element image in storage: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        ctx.stitcher.dispose();
        ctx.stitcher = null;
      }
    }

    case "CAPTURE_ELEMENT_RESTORE":
      ctx.elementCapture.restore();
      return { success: true };

    case "FREE_SELECT": {
      ctx.ensureRuntime();
      ctx.cleanup?.stopInspecting();
      const regionResult = await startFreeSelect();
      if (!regionResult) return { success: false, cancelled: true };
      return { success: true, rect: regionResult.rect, scrollY: regionResult.scrollY, dpr: regionResult.dpr };
    }

    case "CAPTURE_REGION_CROP": {
      try {
        const { dataUrl, rect, dpr } = command.payload;
        const cropX = Math.max(0, Math.round(rect.x * dpr));
        const cropY = Math.max(0, Math.round(rect.y * dpr));
        const cropW = Math.max(1, Math.round(rect.width * dpr));
        const cropH = Math.max(1, Math.round(rect.height * dpr));
        const cropped = await cropDataUrlToPng(dataUrl, { x: cropX, y: cropY, width: cropW, height: cropH });
        try {
          await chrome.storage.local.set({ [`regioncapture:${command.payload.sessionId}`]: cropped });
          return { success: true };
        } catch (error) {
          return { success: false, error: `Failed to stage region image: ${error instanceof Error ? error.message : String(error)}` };
        }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    case "PREPARE_REGION_CAPTURE": {
      await preparations.prepareRegion();
      return { success: true };
    }

    case "RESTORE_REGION_CAPTURE": {
      preparations.restoreRegion();
      return { success: true };
    }

    case "CAPTURE_STITCH_START": {
      ctx.ensureRuntime();
      const originalScrollY = window.scrollY;
      await preRollForCapture(originalScrollY);
      await preparations.prepareFullPage();
      const pageHeightCss = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      );
      const viewportHeightCss = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const scrollY = originalScrollY;
      ctx.fixedHeaders.reset();
      const fixedHeaderCount = ctx.fixedHeaders.detect();
      ctx.stitcher?.dispose();
      const newStitcher = new DefaultCaptureStitcher();
      newStitcher.start(pageHeightCss, dpr, 0, viewportHeightCss);
      ctx.stitcher = newStitcher;
      return {
        success: true,
        metrics: { pageHeightCss, viewportHeightCss, dpr, scrollY, fixedHeaders: fixedHeaderCount },
      };
    }

    case "CAPTURE_SCROLL": {
      const target = command.payload.scrollYCss;
      const scroller = document.scrollingElement ?? document.documentElement;
      scroller.scrollTop = target;
      window.scrollTo(0, target);
      if (target > 0) ctx.fixedHeaders.hideAll();
      void document.documentElement.getBoundingClientRect();
      return { success: true, actualScrollY: window.scrollY };
    }

    case "CAPTURE_SLICE": {
      if (!ctx.stitcher) return { success: false, error: "Stitcher not started" };
      const { blank } = await ctx.stitcher.addSlice(command.payload.dataUrl, command.payload.scrollYCss);
      return { success: true, blank };
    }

    case "CAPTURE_FINALIZE": {
      if (!ctx.stitcher) return { success: false, error: "Stitcher not started" };
      try {
        const finalized = ctx.stitcher.finalizeBestEffort
          ? await ctx.stitcher.finalizeBestEffort()
          : {
              dataUrl: await ctx.stitcher.finalize(),
              complete: true,
              capturedHeightCss: 0,
              requestedHeightCss: 0,
              gapCount: 0,
            };
        try {
          await chrome.storage.local.set({ [`capture:${command.payload.sessionId}`]: finalized.dataUrl });
          return {
            success: true,
            partial: !finalized.complete,
            capturedHeightCss: finalized.capturedHeightCss,
            requestedHeightCss: finalized.requestedHeightCss,
            gapCount: finalized.gapCount,
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to stage image in storage: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } finally {
        ctx.stitcher.dispose();
        ctx.stitcher = null;
        ctx.fixedHeaders.restoreAll();
      }
    }

    case "SELECT_REGION":
      return { success: false, error: "Handled by Service Worker" };
  }
}
