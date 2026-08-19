import { afterEach, describe, expect, it, vi } from "vitest";
import { forceEagerImages, preRollForCapture, waitForImagesReady } from "@content/capture/preload";

function makeImg(): HTMLImageElement {
  const img = document.createElement("img");
  return img;
}

describe("forceEagerImages", () => {
  it("promotes loading=lazy images to eager", () => {
    const img = makeImg();
    img.setAttribute("loading", "lazy");
    document.body.appendChild(img);

    forceEagerImages(document);
    expect(img.getAttribute("loading")).toBe("eager");
    img.remove();
  });

  it("fills data-src and data-srcset placeholders", () => {
    const img = makeImg();
    img.dataset.src = "https://example.com/a.png";
    img.dataset.srcset = "https://example.com/a-1x.png 1x, https://example.com/a-2x.png 2x";
    document.body.appendChild(img);

    forceEagerImages(document);
    expect(img.src).toContain("a.png");
    expect(img.srcset).toContain("a-1x.png");
    img.remove();
  });

  it("resolves a <picture> <source> candidate onto the sibling img", () => {
    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.setAttribute("srcset", "https://example.com/pic-2x.png 2x, https://example.com/pic-1x.png 1x");
    const img = makeImg();
    picture.append(source, img);
    document.body.appendChild(picture);

    forceEagerImages(document);
    expect(img.src).toContain("pic-2x.png");
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