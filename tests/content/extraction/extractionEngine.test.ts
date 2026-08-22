import { describe, expect, it } from "vitest";
import { stableSelector } from "@shared/utils/selector";
import {
  DefaultExtractionEngine,
  confidenceForScore,
  elementReferenceOf,
} from "@content/extraction/extractionEngine";

describe("confidenceForScore", () => {
  it("maps scores to confidence levels", () => {
    expect(confidenceForScore(90)).toBe("HIGH");
    expect(confidenceForScore(70)).toBe("MEDIUM");
    expect(confidenceForScore(30)).toBe("LOW");
    expect(confidenceForScore(0)).toBe("NONE");
  });
});

describe("DefaultExtractionEngine", () => {
  it("runs over the page and returns the top candidate as the article", async () => {
    document.body.innerHTML = `
      <article><p>${"story text ".repeat(100)}</p></article>
      <div>${"nav link ".repeat(20)}</div>
      <section>${"section text ".repeat(40)}</section>
    `;
    const engine = new DefaultExtractionEngine();
    const result = await engine.run();

    expect(result.status).toBe("SUCCESS");
    expect(result.candidates.length).toBeGreaterThan(0);
    const scores = result.candidates.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result.article).toBeTruthy();
    expect(engine.getState().status).toBe("SUCCESS");
  });

  it("ignores blocks under the toolbar marker and short text blocks", async () => {
    document.body.innerHTML = `
      <div data-newsclean-marker><article>${"hidden ".repeat(200)}</article></div>
      <div>tiny</div>
    `;
    const result = await new DefaultExtractionEngine().run();
    expect(result.status).toBe("SUCCESS");
    expect(result.candidates).toHaveLength(0);
  });
});

describe("stableSelector / elementReferenceOf", () => {
  it("prefers id, then classes, then the bare tag", () => {
    const withId = document.createElement("div");
    withId.id = "story";
    document.body.appendChild(withId);
    expect(stableSelector(withId)).toBe("#story");

    const withClass = document.createElement("div");
    withClass.className = "post-body narrow";
    document.body.appendChild(withClass);
    expect(stableSelector(withClass)).toBe("div.post-body.narrow");

    const bare = document.createElement("article");
    document.body.appendChild(bare);
    expect(stableSelector(bare)).toBe("body > article:nth-of-type(1)");
  });

  it("builds a stable element reference", () => {
    const el = document.createElement("main");
    el.id = "content";
    document.body.appendChild(el);
    expect(elementReferenceOf(el, "cand-1")).toEqual({
      id: "cand-1",
      tagName: "main",
      selector: "#content",
    });
  });
});
