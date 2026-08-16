import { describe, expect, it, vi } from "vitest";
import { generateSelector, isSelectorSyntaxValid, validateSelector } from "@shared/utils/selector";

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
});

describe("generateSelector", () => {
  it("prefers a unique id", () => {
    document.body.innerHTML = DOM;
    const el = document.getElementById("hero") as HTMLElement;
    expect(generateSelector(el)).toBe("#hero");
  });

  it("escapes special characters in ids", () => {
    document.body.innerHTML = DOM;
    const el = document.getElementById("weird:name[id]") as HTMLElement;
    expect(generateSelector(el)).toBe("#weird\\:name\\[id\\]");
  });

  it("uses the shortest unique class combination", () => {
    document.body.innerHTML = DOM;
    const el = document.querySelector(".tag.promo") as HTMLElement;
    expect(generateSelector(el)).toBe("span.tag.promo");
  });

  it("falls back to a structural selector for duplicates", () => {
    document.body.innerHTML = DOM;
    const els = document.querySelectorAll(".card p");
    const el = els[1] as HTMLElement;
    expect(generateSelector(el)).toBe("body > div:nth-child(3) > p");
  });

  it("falls back to the bare tag when it is unique", () => {
    document.body.innerHTML = `<main><h2>only</h2></main>`;
    const el = document.querySelector("h2") as HTMLElement;
    expect(generateSelector(el)).toBe("h2");
  });
});
