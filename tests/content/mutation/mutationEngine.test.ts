import { beforeEach, describe, expect, it } from "vitest";
import { DefaultMutationEngine } from "@content/mutation/mutationEngine";
import { HistoryEngine } from "@content/mutation/history";
import type { ElementReference } from "@shared/types";

function setup() {
  document.body.innerHTML = `
    <article id="main">
      <h2>Headline</h2>
      <div class="teaser">Trailing copy</div>
      <aside class="sidebar">Related links</aside>
    </article>
  `;
  const history = new HistoryEngine();
  const mutations = new DefaultMutationEngine(history);
  return { mutations, history };
}

function ref(selector: string): ElementReference {
  return { id: `ref-${selector}`, tagName: "div", selector };
}

describe("DefaultMutationEngine", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("delete removes the element and undo restores it in place", () => {
    const { mutations } = setup();
    const op = mutations.deleteElement(ref(".teaser"));
    expect(op?.action).toBe("DELETE");
    expect(document.querySelector(".teaser")).toBeNull();

    mutations.undo();
    const restored = document.querySelector(".teaser");
    expect(restored).not.toBeNull();
    expect(restored?.textContent).toBe("Trailing copy");
  });

  it("deleteSimilar removes all matches and undo restores them in place", () => {
    const { mutations } = setup();
    document.body.innerHTML = `
      <div class="ad-slot">A</div>
      <p class="prose">body copy</p>
      <div class="ad-slot">B</div>
      <div class="ad-slot">C</div>
    `;

    const count = mutations.deleteSimilar(ref(".ad-slot"));
    expect(count).toBe(3);
    expect(document.querySelectorAll(".ad-slot")).toHaveLength(0);
    expect(document.querySelector(".prose")).not.toBeNull();

    mutations.undo();
    const slots = document.querySelectorAll(".ad-slot");
    expect(slots).toHaveLength(3);
    expect(slots[0]?.textContent).toBe("A");
    expect(slots[1]?.textContent).toBe("B");
    expect(slots[2]?.textContent).toBe("C");
  });

  it("deleteSimilar returns 0 when the target or matches are missing", () => {
    const { mutations } = setup();
    expect(mutations.deleteSimilar(ref(".missing"))).toBe(0);

    document.body.innerHTML = `<div class="ad-slot">A</div>`;
    expect(mutations.deleteSimilar(ref(".ad-slot"))).toBe(1);
  });

  it("deleteMany removes explicit targets as one undoable unit", () => {
    const { mutations } = setup();
    document.body.innerHTML = `
      <div id="ad-a" class="ad-slot">A</div>
      <p class="prose">body copy</p>
      <div id="ad-b" class="ad-slot">B</div>
    `;

    const count = mutations.deleteMany([ref("#ad-a"), ref("#ad-b"), ref(".prose")], "PRESET");
    expect(count).toBe(3);
    expect(document.querySelectorAll(".ad-slot")).toHaveLength(0);
    expect(document.querySelector(".prose")).toBeNull();

    mutations.undo();
    expect(document.querySelectorAll(".ad-slot")).toHaveLength(2);
    expect(document.querySelector("#ad-a")?.textContent).toBe("A");
    expect(document.querySelector("#ad-b")?.textContent).toBe("B");
    expect(document.querySelector(".prose")?.textContent).toBe("body copy");
  });

  it("deleteMany skips unresolved, hidden or duplicate targets", () => {
    const { mutations } = setup();
    document.body.innerHTML = `<div id="ad-a" class="ad-slot">A</div>`;

    const count = mutations.deleteMany([ref("#ad-a"), ref(".missing"), ref("#ad-a")]);
    expect(count).toBe(1);
    expect(document.querySelectorAll(".ad-slot")).toHaveLength(0);

    mutations.undo();
    expect(document.querySelectorAll(".ad-slot")).toHaveLength(1);
  });
  it("undo restores relative order among siblings", () => {
    const { mutations } = setup();
    mutations.deleteElement(ref(".sidebar"));
    mutations.undo();

    const article = document.querySelector("#main");
    const children = article ? Array.from(article.children).map((c) => c.className) : [];
    expect(children).toEqual(["", "teaser", "sidebar"]);
  });

  it("hide sets display none important and undo clears it", () => {
    const { mutations } = setup();
    const op = mutations.hideElement(ref(".sidebar"));
    expect(op?.action).toBe("HIDE");

    const aside = document.querySelector<HTMLElement>(".sidebar");
    expect(aside?.style.getPropertyPriority("display")).toBe("important");

    mutations.undo();
    expect(document.querySelector<HTMLElement>(".sidebar")?.style.display).toBe("");
  });

  it("showElement restores a hidden element and undo re-hides it", () => {
    const { mutations } = setup();
    mutations.hideElement(ref(".sidebar"));

    const aside = document.querySelector<HTMLElement>(".sidebar");
    expect(mutations.isHidden(ref(".sidebar"))).toBe(true);
    expect(aside?.style.display).toBe("none");

    expect(mutations.showElement(ref(".sidebar"))).toBe(true);
    expect(mutations.isHidden(ref(".sidebar"))).toBe(false);
    expect(aside?.style.display).toBe("");

    mutations.undo();
    expect(mutations.isHidden(ref(".sidebar"))).toBe(true);
    expect(aside?.style.display).toBe("none");

    // Re-showing after undo works again.
    expect(mutations.showElement(ref(".sidebar"))).toBe(true);
    expect(aside?.style.display).toBe("");

    // Showing an already-visible element is a no-op.
    expect(mutations.showElement(ref(".sidebar"))).toBe(false);
  });

  it("delete after hide replaces hide in history", () => {
    const { mutations } = setup();
    mutations.hideElement(ref(".sidebar"));
    mutations.undo();
    expect(mutations.redo()).toBe(1);
  });

  it("reset restores every removed element and returns count", () => {
    const { mutations } = setup();
    mutations.deleteElement(ref(".teaser"));
    mutations.deleteElement(ref(".sidebar"));

    const count = mutations.reset();
    expect(count).toBe(2);
    expect(document.querySelector(".teaser")).not.toBeNull();
    expect(document.querySelector(".sidebar")).not.toBeNull();
    expect(mutations.undo()).toBe(0);
  });

  it("returns null when the target cannot be resolved", () => {
    const { mutations } = setup();
    expect(mutations.deleteElement(ref(".missing"))).toBeNull();
  });

  it("tracks keep operations without removing the element", () => {
    const { mutations } = setup();
    const op = mutations.keepElement(ref("#main"));
    expect(op?.action).toBe("KEEP");
    expect(document.querySelector("#main")).not.toBeNull();
    expect(document.querySelector("#main")?.hasAttribute("data-newsclean-keep")).toBe(true);
  });
});
