import type { BackgroundCommand } from "@shared/types";
import type { HandlerContext } from "./types";
import { DefaultCaptureStitcher } from "../capture/captureStitcher";
import { cropDataUrlToPng, loadBitmap, sleep, waitForElementRendering } from "../capture/elementCapture";
import { exceedsCanvasLimit, MAX_CANVAS_DIMENSION, planSlices } from "../capture/sliceMath";
import { forceEagerImages, preRollForCapture, waitForImagesReady } from "../capture/preload";
import { startFreeSelect } from "../selection/freeSelect";

type CaptureCommand = Extract<
  BackgroundCommand,
  | {
      type:
        | "CAPTURE" | "PREPARE_CAPTURE" | "RESTORE_CAPTURE"
        | "PREPARE_ELEMENT_CAPTURE" | "CAPTURE_ELEMENT_SCROLL"
        | "CAPTURE_ELEMENT_SLICE" | "CAPTURE_ELEMENT_FINALIZE"
        | "CAPTURE_ELEMENT_RESTORE"
        | "FREE_SELECT" | "CAPTURE_REGION_CROP"
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
      return { success: true };

    case "RESTORE_CAPTURE":
      ctx.overlay?.setVisible(true);
      ctx.fixedHeaders.restoreAll();
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

      const scroller = document.scrollingElement ?? document.documentElement;
      const maxScroll = Math.max(
        0,
        (scroller.scrollHeight || document.documentElement.scrollHeight) - metrics.viewportHeightCss,
      );
      for (const rel of planSlices(metrics.elementHeightCss, metrics.viewportHeightCss)) {
        const y = Math.min(metrics.elementDocTop + rel, maxScroll);
        scroller.scrollTop = y;
        window.scrollTo(0, y);
        void document.documentElement.getBoundingClientRect();
        await sleep(120);
      }
      await waitForElementRendering(element);

      scroller.scrollTop = metrics.elementDocTop;
      window.scrollTo(0, metrics.elementDocTop);
      void document.documentElement.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const finalMetrics = {
        dpr: metrics.dpr,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        elementDocTop: metrics.elementDocTop,
        elementHeightCss: rect.height,
        viewportHeightCss: metrics.viewportHeightCss,
      };
      if (finalMetrics.elementHeightCss <= 0) {
        ctx.elementCapture.restore();
        return { success: false, error: "Selected element has no visible area" };
      }
      if (exceedsCanvasLimit(finalMetrics.elementHeightCss, finalMetrics.dpr)) {
        ctx.elementCapture.restore();
        return {
          success: false,
          tooTall: true,
          error: `Element is too tall for capture (max ${MAX_CANVAS_DIMENSION}px)`,
        };
      }

      ctx.stitcher?.dispose();
      const newStitcher = new DefaultCaptureStitcher();
      newStitcher.start(finalMetrics.elementHeightCss, finalMetrics.dpr, finalMetrics.elementDocTop);
      ctx.stitcher = newStitcher;
      return { success: true, ...finalMetrics };
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
          if (x > 0 || width < vpWidth) {
            dataUrl = await cropDataUrlToPng(dataUrl, { x, y: 0, width, height: vpHeight });
          }
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

    case "CAPTURE_STITCH_START": {
      ctx.ensureRuntime();
      const originalScrollY = window.scrollY;
      await preRollForCapture(originalScrollY);
      forceEagerImages(document);
      await waitForImagesReady(document);
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
      newStitcher.start(pageHeightCss, dpr);
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
        const dataUrl = await ctx.stitcher.finalize();
        try {
          await chrome.storage.local.set({ [`capture:${command.payload.sessionId}`]: dataUrl });
          return { success: true };
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
