import { describe, expect, it, vi } from "vitest";
import { isSelectorSyntaxValid, stableSelector, validateSelector } from "@shared/utils/selector";

/** happy-dom's selector parser is lenient, so simulate a strict browser. */
function makeQuerySelectorThrow(...selectors: string[]) {
  const frag = document.createDocumentFragment();
  const original = frag.querySelectorAll.bind(frag);
  vi.spyOn(frag, "querySelectorAll").mockImplementation((sel: string) => {
    if (selectors.includes(sel)) throw new DOMException("Syntax error", "SyntaxError");
    return original(sel);
  });
  vi.spyOn(document, "createDocumentFragment").mockReturnValue(frag);
}

const DOM = `
  <div id="hero"><span class="badge promo">x</span></div>
  <div class="card"><p>one</p></div>
  <div class="card"><p>two</p></div>
  <span class="tag">t1</span>
  <span class="tag">t2</span>
  <span class="tag promo">t3</span>
  <section><article><h2>deep</h2></article></section>
  <div id="weird:name[id]">esc</div>
`;

describe("isSelectorSyntaxValid", () => {
  it("accepts valid selectors", () => {
    expect(isSelectorSyntaxValid(".card p")).toBe(true);
    expect(isSelectorSyntaxValid("#hero")).toBe(true);
  });

  it("rejects malformed selectors without throwing", () => {
    makeQuerySelectorThrow("ad[", "((");
    expect(isSelectorSyntaxValid("ad[")).toBe(false);
    expect(isSelectorSyntaxValid("((")).toBe(false);
  });
});

describe("validateSelector", () => {
  it("returns the match count for a valid selector", () => {
    document.body.innerHTML = DOM;
    expect(validateSelector(document, ".card")).toEqual({ ok: true, matchCount: 2 });
    expect(validateSelector(document, "#hero")).toEqual({ ok: true, matchCount: 1 });
  });

  it("returns NO_MATCH when nothing matches", () => {
    document.body.innerHTML = DOM;
    expect(validateSelector(document, ".missing")).toEqual({ ok: false, reason: "NO_MATCH" });
  });

  it("returns INVALID_SELECTOR without crashing", () => {
    document.body.innerHTML = DOM;
    makeQuerySelectorThrow("ad[");
    expect(validateSelector(document, "ad[")).toEqual({ ok: false, reason: "INVALID_SELECTOR" });
  });

  it("contains a hostile ParentNode that throws after syntax validation", () => {
    const root = { querySelectorAll: () => { throw new DOMException("blocked", "SecurityError"); } } as unknown as ParentNode;
    expect(validateSelector(root, ".valid")).toEqual({ ok: false, reason: "INVALID_SELECTOR" });
  });
});

describe("stableSelector", () => {
  it("prefers a unique id", () => {
    document.body.innerHTML = DOM;
    const el = document.getElementById("hero") as HTMLElement;
    expect(stableSelector(el)).toBe("#hero");
  });

  it("escapes special characters in ids", () => {
    document.body.innerHTML = DOM;
    const el = document.getElementById("weird:name[id]") as HTMLElement;
    expect(stableSelector(el)).toBe("#weird\\:name\\[id\\]");
  });

  it("uses data-testid when unique", () => {
    document.body.innerHTML = `
      <div data-testid="promo-banner">A</div>
      <div class="other">B</div>
    `;
    const el = document.querySelector("[data-testid]") as HTMLElement;
    expect(stableSelector(el)).toBe('[data-testid="promo-banner"]');
  });

  it("uses the shortest unique class combination", () => {
    document.body.innerHTML = DOM;
    const el = document.querySelector(".tag.promo") as HTMLElement;
    expect(stableSelector(el)).toBe("span.tag.promo");
  });

  it("falls back to a structural nth-of-type selector for duplicates", () => {
    document.body.innerHTML = DOM;
    const els = document.querySelectorAll(".card");
    const el = els[1] as HTMLElement;
    const selector = stableSelector(el);
    expect(selector).toContain("nth-of-type");
    expect(selector).toContain("body");
  });

  it("falls back to structural nth-of-type when no id/class/testid", () => {
    document.body.innerHTML = `<main><h2>only</h2></main>`;
    const el = document.querySelector("h2") as HTMLElement;
    expect(stableSelector(el)).toBe("body > main:nth-of-type(1) > h2:nth-of-type(1)");
  });

  it("falls back safely when a candidate query throws or an element is detached", () => {
    document.body.innerHTML = `<div id="hostile"><span>child</span></div>`;
    const hostile = document.getElementById("hostile")!;
    const query = vi.spyOn(document, "querySelectorAll").mockImplementation((selector: string) => {
      if (selector.startsWith("#")) throw new DOMException("blocked", "SecurityError");
      return Document.prototype.querySelectorAll.call(document, selector);
    });
    expect(stableSelector(hostile)).toBe("body > div:nth-of-type(1)");
    query.mockRestore();

    const detached = document.createElement("article");
    expect(stableSelector(detached)).toBe("body");
  });

  it("handles a transiently missing data-testid value", () => {
    document.body.innerHTML = `<div data-testid="temporary"></div>`;
    const element = document.querySelector("div")!;
    vi.spyOn(element, "getAttribute").mockReturnValue(null);
    expect(stableSelector(element)).toBe("body > div:nth-of-type(1)");
  });
});
