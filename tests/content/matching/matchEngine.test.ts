import { beforeEach, describe, expect, it } from "vitest";
import { DefaultMatchEngine } from "@content/matching/matchEngine";

describe("DefaultMatchEngine", () => {
  let engine: DefaultMatchEngine;

  beforeEach(() => {
    document.body.innerHTML = "";
    engine = new DefaultMatchEngine();
  });

  it("returns the target plus every element sharing the same signature", () => {
    document.body.innerHTML = `
      <div class="ad-slot"><span>Ad one</span></div>
      <article class="story"><p>Real news</p></article>
      <div class="ad-slot"><span>Ad two</span></div>
      <div class="ad-slot"><span>Ad three</span></div>
    `;
    const target = document.querySelector<HTMLElement>(".ad-slot") as HTMLElement;
    const similar = engine.findSimilar(target);
    expect(similar).toHaveLength(3);
    expect(similar[0]).toBe(target);
    expect(similar.map((el) => el.textContent?.trim())).toEqual(["Ad one", "Ad two", "Ad three"]);
  });

  it("excludes elements with different classes", () => {
    document.body.innerHTML = `
      <div class="ad-slot">A</div>
      <div class="news-slot">B</div>
    `;
    const similar = engine.findSimilar(document.querySelector(".ad-slot") as HTMLElement);
    expect(similar).toHaveLength(1);
  });

  it("matches on semantic data attributes as well as classes", () => {
    document.body.innerHTML = `
      <div data-ad-slot="728x90">A</div>
      <div data-ad-slot="728x90">B</div>
      <div data-ad-slot="300x250">C</div>
    `;
    const target = document.querySelector('[data-ad-slot="728x90"]') as HTMLElement;
    const similar = engine.findSimilar(target);
    expect(similar).toHaveLength(2);
  });

  it("never matches the target's ancestors or descendants", () => {
    document.body.innerHTML = `
      <div class="panel">
        <div class="panel"><span class="panel">inner</span></div>
      </div>
    `;
    const target = document.querySelector<HTMLElement>(".panel") as HTMLElement;
    const similar = engine.findSimilar(target);
    expect(similar).toEqual([target]);
  });

  it("skips NewsClean UI elements even with matching classes", () => {
    document.body.innerHTML = `<div class="ad-slot">A</div>`;
    const root = document.createElement("div");
    root.className = "ad-slot";
    root.setAttribute("data-newsclean-root", "true");
    document.body.appendChild(root);

    const similar = engine.findSimilar(document.querySelector(".ad-slot") as HTMLElement);
    expect(similar).toHaveLength(1);
  });

  it("returns only the target when it has no distinguishing signature", () => {
    document.body.innerHTML = `<p>A</p><p>B</p><p>C</p>`;
    const target = document.querySelector("p") as HTMLElement;
    const similar = engine.findSimilar(target);
    expect(similar).toEqual([target]);
  });

  it("signatureOf is null for generic elements and stable across class order", () => {
    expect(engine.signatureOf(document.createElement("p"))).toBeNull();

    const a = document.createElement("div");
    a.className = "foo bar";
    const b = document.createElement("div");
    b.className = "bar foo";
    expect(engine.signatureOf(a)).toBe("DIV|bar.foo");
    expect(engine.signatureOf(a)).toBe(engine.signatureOf(b));
  });
});
