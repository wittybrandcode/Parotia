import { afterEach, describe, expect, it, vi } from "vitest";
import { forceEagerImages, preRollForCapture, waitForImagesReady, waitForVisualAssets } from "@content/capture/preload";
import { collectImages } from "@shared/utils/media";

function makeImg(): HTMLImageElement {
  const img = document.createElement("img");
  return img;
}

describe("forceEagerImages", () => {
  it("promotes loading=lazy images to eager", () => {
    const img = makeImg();
    img.setAttribute("loading", "lazy");
    document.body.appendChild(img);

    const ledger = forceEagerImages(document);
    expect(img.getAttribute("loading")).toBe("eager");
    ledger.restore();
    expect(img.getAttribute("loading")).toBe("lazy");
    img.remove();
  });

  it("fills data-src and data-srcset placeholders", () => {
    const img = makeImg();
    img.dataset.src = "https://example.com/a.png";
    img.dataset.srcset = "https://example.com/a-1x.png 1x, https://example.com/a-2x.png 2x";
    document.body.appendChild(img);

    const ledger = forceEagerImages(document);
    expect(img.src).toContain("a.png");
    expect(img.srcset).toContain("a-1x.png");
    ledger.restore();
    expect(img.hasAttribute("src")).toBe(false);
    expect(img.hasAttribute("srcset")).toBe(false);
    img.remove();
  });

  it("leaves responsive <picture> candidate selection to the browser", () => {
    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.setAttribute("srcset", "https://example.com/pic-2x.png 2x, https://example.com/pic-1x.png 1x");
    const img = makeImg();
    picture.append(source, img);
    document.body.appendChild(picture);

    const ledger = forceEagerImages(document);
    expect(img.hasAttribute("src")).toBe(false);
    expect(source.getAttribute("srcset")).toContain("pic-2x.png");
    ledger.restore();
    picture.remove();
  });

  it("leaves an already-eager image untouched", () => {
    const img = makeImg();
    img.setAttribute("loading", "eager");
    img.src = "https://example.com/ok.png";
    document.body.appendChild(img);

    forceEagerImages(document);
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.src).toContain("ok.png");
    img.remove();
  });
});

describe("waitForImagesReady", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves once all images decode", async () => {
    const img = makeImg();
    img.decode = vi.fn(async () => {
      Object.defineProperty(img, "complete", { value: true, configurable: true });
    });
    Object.defineProperty(img, "complete", { value: false, configurable: true });
    Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });
    document.body.appendChild(img);

    await waitForImagesReady(document, 1000);
    expect(img.decode).toHaveBeenCalled();
    img.remove();
  });

  it("resolves after the deadline even when an image never completes", async () => {
    vi.useFakeTimers();
    const img = makeImg();
    img.decode = vi.fn(async () => undefined);
    Object.defineProperty(img, "complete", { value: false, configurable: true });
    Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });
    document.body.appendChild(img);

    const pending = waitForImagesReady(document, 500);
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    expect(img.decode).toHaveBeenCalled();
    img.remove();
    vi.useRealTimers();
  });
});

describe("preRollForCapture", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls down to the bottom in steps and restores the original position", async () => {
    const recorded: number[] = [];
    const fakeScroller = { scrollHeight: 3000, scrollTop: 0 };
    Object.defineProperty(document, "scrollingElement", { value: fakeScroller, configurable: true });
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation((_x, y) => {
      fakeScroller.scrollTop = y;
    });
    // Record every scrollTop assignment through the setter.
    let current = 0;
    Object.defineProperty(fakeScroller, "scrollTop", {
      get: () => current,
      set: (v: number) => {
        current = v;
        recorded.push(v);
      },
      configurable: true,
    });

    await preRollForCapture(0);

    // The page was rolled down to the bottom (>= one viewport) and back to 0.
    expect(recorded.some((y) => y >= 1500)).toBe(true);
    expect(recorded[recorded.length - 1]).toBe(0);
    expect(scrollToSpy).toHaveBeenCalled();
  });
});

describe("visual media matrix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("collects images from an open shadow root even when the host is the root", () => {
    const host = document.createElement("section");
    const shadow = host.attachShadow({ mode: "open" });
    const image = makeImg();
    shadow.append(image);
    expect(collectImages(host)).toEqual([image]);
  });

  it("preloads video posters, SVG images, CSS backgrounds and shadow assets", async () => {
    const requested: string[] = [];
    class PreloadImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        requested.push(value);
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", PreloadImage);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });

    const video = document.createElement("video");
    video.setAttribute("poster", "https://assets.test/poster.png");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const svgImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
    svgImage.setAttribute("href", "https://assets.test/vector.png");
    svg.append(svgImage);
    const background = document.createElement("div");
    background.style.backgroundImage = "url(https://assets.test/background.png)";
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const shadowBackground = document.createElement("div");
    shadowBackground.style.backgroundImage = "url(https://assets.test/shadow.png)";
    shadow.append(shadowBackground);
    document.body.append(video, svg, background, host);

    const result = await waitForVisualAssets(document, 500);
    expect(result).toEqual({ timedOut: false, pendingImages: 0, pendingExternalAssets: [] });
    expect(requested).toEqual(expect.arrayContaining([
      "https://assets.test/poster.png",
      "https://assets.test/vector.png",
      "https://assets.test/background.png",
      "https://assets.test/shadow.png",
    ]));
  });

  it("returns bounded diagnostics for media that never becomes ready", async () => {
    vi.useFakeTimers();
    const image = makeImg();
    image.decode = vi.fn(async () => undefined);
    Object.defineProperty(image, "complete", { value: false, configurable: true });
    Object.defineProperty(image, "naturalWidth", { value: 0, configurable: true });
    Object.defineProperty(document, "fonts", { value: { ready: new Promise(() => undefined) }, configurable: true });
    document.body.append(image);

    const pending = waitForVisualAssets(document, 200);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    expect(result.timedOut).toBe(true);
    expect(result.pendingImages).toBe(1);
    vi.useRealTimers();
  });
});
