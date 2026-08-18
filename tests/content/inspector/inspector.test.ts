import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultInspector, elementReferenceOf, type InspectorActionHandlers } from "@content/inspector/inspector";

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

const FAKE_RECT = {
  x: 50,
  y: 100,
  top: 100,
  left: 50,
  right: 250,
  bottom: 180,
  width: 200,
  height: 80,
  toJSON: () => ({}),
};

describe("DefaultInspector", () => {
  const inspectors: DefaultInspector[] = [];

  beforeEach(() => {
    document.body.innerHTML = `
      <article id="main">
        <h2>Headline</h2>
        <div class="teaser">Trailing copy</div>
      </article>
    `;
    document.documentElement.querySelectorAll("[data-newsclean-highlight]").forEach((el) => el.remove());
  });

  afterEach(() => {
    inspectors.forEach((i) => i.stop());
    inspectors.length = 0;
    document.body.innerHTML = "";
    document.documentElement.querySelectorAll("[data-newsclean-highlight]").forEach((el) => el.remove());
  });

  it("shows a hover overlay that follows the element under the cursor", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue(FAKE_RECT);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    inspector.start(() => undefined);

    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );
    await waitForFrame();

    const overlay = document.querySelector("[data-newsclean-highlight]") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.display).toBe("block");
    expect(overlay.style.top).toBe("100px");
    expect(overlay.style.left).toBe("50px");
    expect(overlay.style.width).toBe("200px");
    expect(overlay.style.height).toBe("80px");
  });

  it("calls onSelect with a reference when the user clicks an element", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue(FAKE_RECT);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    const onSelect = vi.fn();
    inspector.start(onSelect);

    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );
    await waitForFrame();

    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    const ref = onSelect.mock.calls[0]?.[0];
    expect(ref?.selector).toContain("teaser");
    expect(ref?.tagName).toBe("div");

    const selection = document.querySelector('[data-newsclean-highlight]') as HTMLElement;
    expect(selection.style.display).toBe("block");
  });

  it("stays active after a click so the user can pick repeatedly", () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    inspector.start(() => undefined);
    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );
    expect(inspector.active).toBe(true);
  });

  it("ignores NewsClean UI and clears overlays on stop", () => {
    const root = document.createElement("div");
    root.setAttribute("data-newsclean-root", "true");
    document.body.appendChild(root);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(root);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    const onSelect = vi.fn();
    inspector.start(onSelect);

    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );
    expect(onSelect).not.toHaveBeenCalled();

    inspector.stop();
    expect(document.querySelector("[data-newsclean-highlight]")).toBeNull();
  });

  it("anchors the action bar near the top inside the selected element", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue(FAKE_RECT);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    inspector.start(() => undefined);

    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );
    await waitForFrame();
    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.display).toBe("flex");
    // Rects: top 100, left 50 → bar sits at 108 / 58 (inside the element).
    expect(bar.style.top).toBe("108px");
    expect(bar.style.left).toBe("58px");
    expect(bar.querySelector('[data-nc-action="delete"]')).not.toBeNull();
    expect(bar.querySelector('[data-nc-action="hide"]')).not.toBeNull();
  });

  it("keeps the bar near the top and on screen for very tall elements", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 5000,
      width: 800,
      height: 5000,
      toJSON: () => ({}),
    });
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    inspector.start(() => undefined);
    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    expect(bar.style.display).toBe("flex");
    // Top is clamped below the toolbar (~60px), not at element top.
    expect(bar.style.top).toBe("60px");
    expect(bar.style.left).toBe("8px");
  });

  it("pins the bar to the top of the viewport when the element is above the fold", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: -500,
      top: -500,
      left: 0,
      right: 200,
      bottom: -400,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    inspector.start(() => undefined);
    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    // Pinned below the toolbar, not at viewport edge.
    expect(bar.style.top).toBe("60px");
    expect(bar.style.left).toBe("8px");
  });

  it("action bar buttons trigger their handlers", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue(FAKE_RECT);
    const elementFromPoint = vi.spyOn(document, "elementFromPoint");
    elementFromPoint.mockReturnValue(teaser);

    const handlers: InspectorActionHandlers = {
      onDelete: vi.fn(),
      onHide: vi.fn(),
    };
    const inspector = new DefaultInspector(handlers);
    inspectors.push(inspector);
    inspector.start(() => undefined);

    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    // The action bar is NewsClean UI: the picker ignores it, so button clicks
    // are not swallowed by the picker's capture listener.
    elementFromPoint.mockReturnValue(bar.querySelector('[data-nc-action="delete"]') as HTMLElement);

    (bar.querySelector('[data-nc-action="delete"]') as HTMLButtonElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    (bar.querySelector('[data-nc-action="hide"]') as HTMLButtonElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    expect(handlers.onHide).toHaveBeenCalledTimes(1);
  });

  it("turns the Hide button into a Show toggle for a hidden element", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue(FAKE_RECT);
    const elementFromPoint = vi.spyOn(document, "elementFromPoint");
    elementFromPoint.mockReturnValue(teaser);

    let hidden = false;
    const handlers: InspectorActionHandlers = {
      onDelete: () => undefined,
      onHide: vi.fn(() => {
        hidden = true;
      }),
      onShow: vi.fn(() => {
        hidden = false;
      }),
      isHidden: () => hidden,
    };
    const inspector = new DefaultInspector(handlers);
    inspectors.push(inspector);
    inspector.start(() => undefined);
    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    const hideShow = bar.querySelector('[data-nc-action="hide"]') as HTMLButtonElement;
    // The action bar is NewsClean UI, so the picker must not swallow its clicks.
    elementFromPoint.mockReturnValue(hideShow);

    // Initially the element is visible → button hides.
    expect(hideShow.title).toBe("Hide element");
    hideShow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(handlers.onHide).toHaveBeenCalledTimes(1);

    // After hiding, the button becomes Show and its click shows the element.
    await vi.waitFor(() => expect(hideShow.title).toBe("Show element"));
    hideShow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(handlers.onShow).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(hideShow.title).toBe("Hide element"));
  });

  it("keeps the action bar visible at the last position while the element is hidden", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    const rectSpy = vi.spyOn(teaser, "getBoundingClientRect");
    rectSpy.mockReturnValue(FAKE_RECT);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    let hidden = false;
    const inspector = new DefaultInspector({
      onDelete: () => undefined,
      onHide: () => {
        hidden = true;
      },
      onShow: () => {
        hidden = false;
      },
      isHidden: () => hidden,
    });
    inspectors.push(inspector);
    inspector.start(() => undefined);
    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    expect(bar.style.display).toBe("flex");

    // Hide collapses the element to a zero box; the bar must stay put.
    hidden = true;
    rectSpy.mockReturnValue({ ...FAKE_RECT, width: 0, height: 0 });
    window.dispatchEvent(
      new MouseEvent("scroll", { bubbles: true, cancelable: true }),
    );
    expect(bar.style.display).toBe("flex");
    expect(bar.style.top).toBe("108px");
    expect(bar.style.left).toBe("58px");
  });

  it("action bar is excluded from picking and hides after the element is deleted", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue(FAKE_RECT);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(teaser);

    const inspector = new DefaultInspector();
    inspectors.push(inspector);
    const onSelect = vi.fn();
    inspector.start(onSelect);

    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Simulate Delete removing the picked element from the DOM.
    teaser.remove();
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );
    await waitForFrame();

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.display).toBe("none");
  });

  it("shows a delete-similar button that triggers onDeleteSimilar", async () => {
    const teaser = document.querySelector<HTMLElement>(".teaser") as HTMLElement;
    vi.spyOn(teaser, "getBoundingClientRect").mockReturnValue(FAKE_RECT);
    const elementFromPoint = vi.spyOn(document, "elementFromPoint");
    elementFromPoint.mockReturnValue(teaser);

    const handlers: InspectorActionHandlers = {
      onDelete: vi.fn(),
      onHide: vi.fn(),
      onDeleteSimilar: vi.fn(),
    };
    const inspector = new DefaultInspector(handlers);
    inspectors.push(inspector);
    inspector.start(() => undefined);

    window.dispatchEvent(
      new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
    );

    const bar = document.querySelector(".nc-action-bar") as HTMLElement;
    const button = bar.querySelector('[data-nc-action="delete-similar"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    elementFromPoint.mockReturnValue(button);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(handlers.onDeleteSimilar).toHaveBeenCalledTimes(1);
  });

  it("generates a selector that resolves to the picked element even when many siblings share data-testid", () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="tweet">First tweet</article>
        <article data-testid="tweet">Second tweet</article>
        <article data-testid="tweet">Third tweet</article>
      </main>
    `;
    const tweets = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]');
    const second = tweets[1] as HTMLElement;

    const ref = elementReferenceOf(second);
    // A bare [data-testid="tweet"] would resolve to the FIRST tweet — the bug.
    expect(ref.selector).not.toBe('[data-testid="tweet"]');
    expect(document.querySelector(ref.selector)).toBe(second);

    // The first tweet keeps a selector that still resolves to itself.
    const first = tweets[0] as HTMLElement;
    const firstRef = elementReferenceOf(first);
    expect(document.querySelector(firstRef.selector)).toBe(first);
  });
});
