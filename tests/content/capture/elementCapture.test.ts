import { beforeEach, describe, expect, it } from "vitest";
import {
  CAPTURE_ATTR,
  CAPTURE_STYLE_ATTR,
  ElementCaptureIsolator,
  isViewportAnchored,
} from "@content/capture/elementCapture";

const PAGE = `
  <div id="sibling-a">Other content</div>
  <div id="target"><p>Capturable element</p></div>
  <div id="sibling-b">More content</div>
`;

function setup(targetId = "#target") {
  document.body.innerHTML = PAGE;
  const target = document.querySelector<HTMLElement>(targetId);
  if (!target) throw new Error("target missing");
  return { target, isolator: new ElementCaptureIsolator() };
}

function captureStyle(): HTMLStyleElement | null {
  return document.head?.querySelector(`style[${CAPTURE_STYLE_ATTR}]`) ?? null;
}

describe("ElementCaptureIsolator", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.querySelectorAll(`style[${CAPTURE_STYLE_ATTR}]`).forEach((el) => el.remove());
    document.documentElement.removeAttribute(CAPTURE_ATTR);
  });

  it("marks the element and injects a style hiding everything else", () => {
    const { target, isolator } = setup();
    const metrics = isolator.isolate(target);

    expect(target.getAttribute(CAPTURE_ATTR)).toBe("true");
    const style = captureStyle();
    expect(style).toBeTruthy();
    const css = style?.textContent ?? "";
    expect(css).toContain("visibility: hidden !important");
    expect(css).toContain(`[${CAPTURE_ATTR}]`);
    expect(metrics.dpr).toBe(window.devicePixelRatio || 1);
    expect(typeof metrics.rect.left).toBe("number");
    expect(typeof metrics.rect.width).toBe("number");
    expect(typeof metrics.elementDocTop).toBe("number");
    expect(typeof metrics.elementHeightCss).toBe("number");
    expect(typeof metrics.viewportHeightCss).toBe("number");
  });

  it("marks the root <html> element so the scoped rules actually match", () => {
    const { target, isolator } = setup();
    isolator.isolate(target);

    expect(document.documentElement.getAttribute(CAPTURE_ATTR)).toBe("true");
    expect(target.getAttribute(CAPTURE_ATTR)).toBe("true");
  });

  it("scopes every rule to html so the marker on <html> activates the isolation", () => {
    const { isolator } = setup();
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("target missing");

    isolator.isolate(target);

    const css = captureStyle()?.textContent ?? "";
    expect(css).toContain(`html[${CAPTURE_ATTR}="true"] body > *`);
    expect(css).toContain(`html[${CAPTURE_ATTR}="true"] [data-newsclean-root]`);
    expect(css).toContain(`html[${CAPTURE_ATTR}="true"] [${CAPTURE_ATTR}]`);
    expect(css).toContain("content-visibility: visible !important");
  });

  it("also hides the picker overlays and action bar so they never appear in the image", () => {
    const { target, isolator } = setup();
    isolator.isolate(target);
    const css = captureStyle()?.textContent ?? "";
    expect(css).toContain("[data-newsclean-root]");
    expect(css).toContain("[data-newsclean-highlight]");
    expect(css).toContain(".nc-action-bar");
    expect(css).toContain("display: none");
  });

  it("forces lazy images inside the element to eager and restores them on restore", () => {
    document.body.innerHTML = `
      <div id="target">
        <img src="about:blank" loading="lazy" alt="profile" />
        <img src="about:blank" alt="media" />
      </div>
    `;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("target missing");
    const isolator = new ElementCaptureIsolator();

    isolator.isolate(target);
    const imgs = Array.from(target.querySelectorAll("img"));
    expect(imgs.map((i) => i.getAttribute("loading"))).toEqual(["eager", "eager"]);

    isolator.restore();
    expect(imgs[0]?.getAttribute("loading")).toBe("lazy");
    expect(imgs[1]?.hasAttribute("loading")).toBe(false);
  });

  it("also forces the image itself when the target IS the image element", () => {
    document.body.innerHTML = `
      <div id="wrap" style="opacity: 0">
        <img id="avatar" src="about:blank" loading="lazy" alt="profile" />
      </div>
    `;
    const avatar = document.querySelector<HTMLElement>("#avatar");
    const wrap = document.querySelector<HTMLElement>("#wrap");
    if (!avatar || !wrap) throw new Error("elements missing");
    const isolator = new ElementCaptureIsolator();

    isolator.isolate(avatar);

    // The lazy avatar itself is forced eager.
    expect(avatar.getAttribute("loading")).toBe("eager");
    // The transparent wrapper is lifted so the avatar is actually painted.
    expect(wrap.style.opacity).toBe("1");

    isolator.restore();
    expect(avatar.getAttribute("loading")).toBe("lazy");
    expect(wrap.style.opacity).toBe("0");
  });

  it("restore removes the style, both markers, and restores the page exactly", () => {
    const { target, isolator } = setup();
    const before = document.body.innerHTML;

    isolator.isolate(target);
    expect(captureStyle()).toBeTruthy();
    expect(document.documentElement.getAttribute(CAPTURE_ATTR)).toBe("true");

    isolator.restore();
    expect(captureStyle()).toBeNull();
    expect(target.hasAttribute(CAPTURE_ATTR)).toBe(false);
    expect(document.documentElement.hasAttribute(CAPTURE_ATTR)).toBe(false);
    expect(document.body.innerHTML).toBe(before);
  });

  it("re-isolating another element cleans up the previous one", () => {
    const { isolator } = setup();
    const first = document.querySelector<HTMLElement>("#sibling-a");
    const second = document.querySelector<HTMLElement>("#sibling-b");
    if (!first || !second) throw new Error("siblings missing");

    isolator.isolate(first);
    isolator.isolate(second);

    expect(document.querySelectorAll(`style[${CAPTURE_STYLE_ATTR}]`).length).toBe(1);
    expect(first.hasAttribute(CAPTURE_ATTR)).toBe(false);
    expect(second.getAttribute(CAPTURE_ATTR)).toBe("true");
    expect(document.documentElement.getAttribute(CAPTURE_ATTR)).toBe("true");
  });

  it("reports anchored=false for a normal in-flow element and marks it in metrics", () => {
    const { target, isolator } = setup();
    const metrics = isolator.isolate(target);

    expect(metrics.anchored).toBe(false);
    expect(isViewportAnchored(target)).toBe(false);
  });

  it("detects viewport-anchored (fixed/sticky) elements", () => {
    document.body.innerHTML = `
      <div id="stickyWrap" style="position: sticky; top: 0">
        <div id="inner"><p>content</p></div>
      </div>
      <div id="fixedEl" style="position: fixed; top: 10px">fixed</div>
    `;
    const stickyChild = document.querySelector<HTMLElement>("#inner");
    const fixed = document.querySelector<HTMLElement>("#fixedEl");
    if (!stickyChild || !fixed) throw new Error("elements missing");

    // The element itself is sticky — but it is still inside the body flow, so
    // capturing the sticky child directly is also anchored.
    const sticky = document.querySelector<HTMLElement>("#stickyWrap");
    expect(isViewportAnchored(sticky as HTMLElement)).toBe(true);
    expect(isViewportAnchored(stickyChild)).toBe(true);
    expect(isViewportAnchored(fixed)).toBe(true);
  });

  it("waitForSliceReady is additive: flips late-arriving lazy images and restores them", async () => {
    document.body.innerHTML = `
      <div id="target">
        <img src="about:blank" loading="lazy" alt="early" />
      </div>
    `;
    const target = document.querySelector<HTMLElement>("#target");
    if (!target) throw new Error("target missing");
    const isolator = new ElementCaptureIsolator();
    isolator.isolate(target);

    // A site hydrates a new lazy image after isolate().
    const late = document.createElement("img");
    late.src = "about:blank";
    late.setAttribute("loading", "lazy");
    target.appendChild(late);

    await isolator.waitForSliceReady(200);

    const imgs = Array.from(target.querySelectorAll("img"));
    expect(imgs.map((i) => i.getAttribute("loading"))).toEqual(["eager", "eager"]);

    isolator.restore();
    expect(imgs[0]?.getAttribute("loading")).toBe("lazy");
    expect(imgs[1]?.getAttribute("loading")).toBe("lazy");
  });

  it("waitForSliceReady is a no-op when nothing is isolated", async () => {
    const isolator = new ElementCaptureIsolator();
    await expect(isolator.waitForSliceReady(50)).resolves.toBeUndefined();
  });
});
