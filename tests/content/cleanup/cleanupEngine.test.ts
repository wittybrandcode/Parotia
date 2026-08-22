import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElementReference } from "@shared/types";
import { DefaultCleanupEngine } from "@content/cleanup/cleanupEngine";
import { HistoryEngine } from "@content/mutation/history";
import { DefaultMutationEngine } from "@content/mutation/mutationEngine";
import { elementReferenceOf } from "@content/inspector/inspector";

/** Tracks the latest engine so `afterEach` can tear down its window listeners. */
let engine: DefaultCleanupEngine | null = null;

function setup() {
  const history = new HistoryEngine();
  const mutations = new DefaultMutationEngine(history);
  const cleanup = new DefaultCleanupEngine(mutations);
  engine = cleanup;
  return { cleanup, mutations, history };
}

function refFor(selector: string): ElementReference {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing fixture: ${selector}`);
  return elementReferenceOf(element);
}

const PAGE = `
  <main id="article">
    <section id="a" class="ad">A</section>
    <section id="b" class="ad">B</section>
    <section id="c" class="ad">C</section>
    <div id="nl" class="newsletter">Sign up</div>
    <div id="related">Related</div>
  </main>
`;

/** Stub elementFromPoint and click at (10,10) to pick `selector` via the inspector. */
function pickViaInspector(cleanup: DefaultCleanupEngine, selector: string): ElementReference {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) throw new Error(`missing fixture: ${selector}`);
  const pick = vi.spyOn(document, "elementFromPoint").mockReturnValue(target);
  cleanup.startInspecting();
  document.body.dispatchEvent(
    new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true, cancelable: true }),
  );
  pick.mockRestore();
  const ref = cleanup.selected;
  if (!ref) throw new Error("inspector never set the selection");
  return ref;
}

describe("DefaultCleanupEngine", () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE;
  });

  afterEach(() => {
    engine?.stopInspecting();
    engine = null;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  describe("inspection mode", () => {
    it("startInspecting/stopInspecting toggle the inspector", () => {
      const { cleanup } = setup();
      expect(cleanup.inspecting).toBe(false);
      cleanup.startInspecting();
      expect(cleanup.inspecting).toBe(true);
      cleanup.stopInspecting();
      expect(cleanup.inspecting).toBe(false);
    });

    it("picks the element under the pointer and exposes it as the selection", () => {
      const { cleanup } = setup();
      const ref = pickViaInspector(cleanup, "#b");
      expect(ref.selector).toBe("#b");
      expect(cleanup.selected?.selector).toBe("#b");
    });

    it("clears the selection when starting to inspect again", () => {
      const { cleanup } = setup();
      pickViaInspector(cleanup, "#a");
      cleanup.startInspecting();
      expect(cleanup.selected).toBeNull();
    });
  });

  describe("deleteTarget", () => {
    it("removes the element, tracks the removed count and an active rule", () => {
      const { cleanup } = setup();
      const ref = refFor("#a");
      expect(cleanup.deleteTarget(ref)).toBe(true);
      expect(document.querySelector("#a")).toBeNull();
      expect(cleanup.getState().removedCount).toBe(1);
      expect(cleanup.getState().activeRules).toEqual([
        { id: `rule-${ref.id}`, selector: "#a", action: "DELETE", enabled: true },
      ]);
    });

    it("returns false and changes nothing for an unresolvable reference", () => {
      const { cleanup } = setup();
      const missing: ElementReference = { id: "ghost", tagName: "div", selector: "#does-not-exist" };
      expect(cleanup.deleteTarget(missing)).toBe(false);
      expect(cleanup.getState().removedCount).toBe(0);
      expect(cleanup.getState().activeRules).toHaveLength(0);
    });

    it("returns false when the element is already gone", () => {
      const { cleanup } = setup();
      const ref = refFor("#a");
      expect(cleanup.deleteTarget(ref)).toBe(true);
      expect(cleanup.deleteTarget(ref)).toBe(false);
    });
  });

  describe("hideTarget / showSelected / isHidden", () => {
    it("hides the element with display:none and tracks the hidden count", () => {
      const { cleanup } = setup();
      const ref = refFor("#nl");
      expect(cleanup.hideTarget(ref)).toBe(true);
      expect((document.querySelector("#nl") as HTMLElement).style.display).toBe("none");
      expect(cleanup.getState().hiddenCount).toBe(1);
      expect(cleanup.isHidden(ref)).toBe(true);
      expect(cleanup.isHidden(refFor("#a"))).toBe(false);
    });

    it("showSelected restores the selected hidden element and adjusts counters", () => {
      const { cleanup } = setup();
      const ref = pickViaInspector(cleanup, "#nl");
      cleanup.hideTarget(ref);
      expect(cleanup.getState().selectedHidden).toBe(true);

      expect(cleanup.showSelected()).toBe(true);
      expect((document.querySelector("#nl") as HTMLElement).style.display).not.toBe("none");
      expect(cleanup.getState().hiddenCount).toBe(0);
      expect(cleanup.getState().selectedHidden).toBe(false);
      expect(cleanup.getState().activeRules).toHaveLength(0);
    });

    it("showSelected does nothing without a selection", () => {
      const { cleanup } = setup();
      expect(cleanup.showSelected()).toBe(false);
    });
  });

  describe("deleteSimilarTargets", () => {
    it("deletes the picked element and its structural lookalikes as one batch", () => {
      const { cleanup } = setup();
      document.body.innerHTML = `
        <div data-ad-slot="x" class="slot">1</div>
        <div data-ad-slot="x" class="slot">2</div>
        <div data-ad-slot="y" class="slot">3</div>
        <article>content</article>
      `;
      const first = document.querySelector<HTMLElement>('[data-ad-slot="x"]');
      if (!first) throw new Error("fixture");
      const count = cleanup.deleteSimilarTargets(elementReferenceOf(first));
      expect(count).toBe(2);
      expect(document.querySelectorAll('[data-ad-slot="x"]')).toHaveLength(0);
      expect(document.querySelector('[data-ad-slot="y"]')).not.toBeNull();
      expect(cleanup.getState().removedCount).toBe(2);
    });

    it("deletes just the single target when it is too generic to match anything", () => {
      const { cleanup } = setup();
      const generic = document.querySelector<HTMLElement>("#related");
      if (!generic) throw new Error("fixture");
      // A generic element (no classes, no semantic data attrs) matches only
      // itself, so "delete similar" degrades to deleting the picked element.
      expect(cleanup.deleteSimilarTargets(elementReferenceOf(generic))).toBe(1);
      expect(document.querySelector("#related")).toBeNull();
      expect(cleanup.getState().removedCount).toBe(1);
    });
  });

  describe("delete-similar preview", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div data-ad-slot="x" class="slot">1</div>
        <div data-ad-slot="x" class="slot">2</div>
        <div data-ad-slot="y" class="slot">3</div>
      `;
    });

    it("previewSimilarTargets reports the match set without deleting", () => {
      const { cleanup } = setup();
      const first = document.querySelector<HTMLElement>('[data-ad-slot="x"]');
      if (!first) throw new Error("fixture");

      const preview = cleanup.previewSimilarTargets(elementReferenceOf(first));
      expect(preview?.count).toBe(2);
      expect(document.querySelectorAll('[data-ad-slot="x"]')).toHaveLength(2);
      expect(cleanup.getState().removedCount).toBe(0);
    });

    it("confirmDeleteSimilar deletes exactly the previewed set", () => {
      const { cleanup } = setup();
      const first = document.querySelector<HTMLElement>('[data-ad-slot="x"]');
      if (!first) throw new Error("fixture");
      const preview = cleanup.previewSimilarTargets(elementReferenceOf(first));
      if (!preview) throw new Error("preview");

      const count = cleanup.confirmDeleteSimilar(elementReferenceOf(first), preview.signatures);
      expect(count).toBe(2);
      expect(document.querySelectorAll('[data-ad-slot="x"]')).toHaveLength(0);
      expect(document.querySelector('[data-ad-slot="y"]')).not.toBeNull();
    });

    it("rejects the confirm when the DOM changed since the preview", () => {
      const { cleanup } = setup();
      const first = document.querySelector<HTMLElement>('[data-ad-slot="x"]');
      if (!first) throw new Error("fixture");
      const preview = cleanup.previewSimilarTargets(elementReferenceOf(first));
      if (!preview) throw new Error("preview");

      // Page mutates between preview and confirm: a different ad slot appears.
      const extra = document.createElement("div");
      extra.setAttribute("data-ad-slot", "x");
      extra.className = "slot";
      document.body.appendChild(extra);

      const count = cleanup.confirmDeleteSimilar(elementReferenceOf(first), preview.signatures);
      expect(count).toBe(0);
      expect(document.querySelectorAll('[data-ad-slot="x"]')).toHaveLength(3);
    });

    it("showPreview adds overlay boxes and clearPreview removes them", () => {
      const { cleanup } = setup();
      const first = document.querySelector<HTMLElement>('[data-ad-slot="x"]');
      if (!first) throw new Error("fixture");
      const preview = cleanup.previewSimilarTargets(elementReferenceOf(first));
      if (!preview) throw new Error("preview");

      cleanup.showPreview(preview.elements);
      expect(document.querySelectorAll("[data-newsclean-preview]")).toHaveLength(2);

      cleanup.clearPreview();
      expect(document.querySelectorAll("[data-newsclean-preview]")).toHaveLength(0);
    });
  });

  describe("undo / redo counter consistency", () => {
    it("tracks removedCount across individual deletes, undo and redo", () => {
      const { cleanup } = setup();
      cleanup.deleteTarget(refFor("#a"));
      cleanup.deleteTarget(refFor("#b"));
      expect(cleanup.getState().removedCount).toBe(2);

      expect(cleanup.undo()).toBe(true);
      expect(cleanup.getState().removedCount).toBe(1);
      expect(document.querySelector("#b")).not.toBeNull();
      expect(document.querySelector("#a")).toBeNull();

      expect(cleanup.undo()).toBe(true);
      expect(cleanup.getState().removedCount).toBe(0);

      expect(cleanup.undo()).toBe(false);
      expect(cleanup.getState().removedCount).toBe(0);

      expect(cleanup.redo()).toBe(true);
      expect(cleanup.getState().removedCount).toBe(1);
      expect(document.querySelector("#a")).toBeNull();
      expect(document.querySelector("#b")).not.toBeNull();
    });

    it("adjusts hiddenCount on undo/redo of a hide", () => {
      const { cleanup } = setup();
      cleanup.hideTarget(refFor("#nl"));
      expect(cleanup.getState().hiddenCount).toBe(1);

      expect(cleanup.undo()).toBe(true);
      expect(cleanup.getState().hiddenCount).toBe(0);
      expect((document.querySelector("#nl") as HTMLElement).style.display).not.toBe("none");

      expect(cleanup.redo()).toBe(true);
      expect(cleanup.getState().hiddenCount).toBe(1);
      expect((document.querySelector("#nl") as HTMLElement).style.display).toBe("none");
    });

    it("decrements removedCount by the whole batch size when undoing deleteSimilar", () => {
      const { cleanup } = setup();
      document.body.innerHTML = `
        <div data-ad-slot="x" class="slot">1</div>
        <div data-ad-slot="x" class="slot">2</div>
      `;
      const first = document.querySelector<HTMLElement>('[data-ad-slot="x"]');
      if (!first) throw new Error("fixture");
      cleanup.deleteSimilarTargets(elementReferenceOf(first));
      expect(cleanup.getState().removedCount).toBe(2);

      expect(cleanup.undo()).toBe(true);
      expect(cleanup.getState().removedCount).toBe(0);
      expect(document.querySelectorAll('[data-ad-slot="x"]')).toHaveLength(2);
    });

    it("mix of delete and hide restores consistent counters across undoAll/redoAll", () => {
      const { cleanup } = setup();
      cleanup.deleteTarget(refFor("#a"));
      cleanup.hideTarget(refFor("#nl"));
      cleanup.deleteTarget(refFor("#b"));
      expect(cleanup.getState().removedCount).toBe(2);
      expect(cleanup.getState().hiddenCount).toBe(1);

      while (cleanup.undo()) {
        /* undo all */
      }
      expect(cleanup.getState().removedCount).toBe(0);
      expect(cleanup.getState().hiddenCount).toBe(0);
      expect(document.querySelector("#a")).not.toBeNull();
      expect(document.querySelector("#b")).not.toBeNull();
      expect((document.querySelector("#nl") as HTMLElement).style.display).not.toBe("none");

      while (cleanup.redo()) {
        /* redo all */
      }
      expect(cleanup.getState().removedCount).toBe(2);
      expect(cleanup.getState().hiddenCount).toBe(1);
      expect(document.querySelector("#a")).toBeNull();
      expect((document.querySelector("#nl") as HTMLElement).style.display).toBe("none");
    });

    it("a new action after undo clears the redo stack", () => {
      const { cleanup } = setup();
      cleanup.deleteTarget(refFor("#a"));
      cleanup.undo();
      cleanup.deleteTarget(refFor("#b"));
      expect(cleanup.redo()).toBe(false);
      expect(cleanup.getState().removedCount).toBe(1);
    });
  });

  describe("undoThrough", () => {
    it("undoes entries one by one until the target entry and keeps counts right", () => {
      const { cleanup, mutations } = setup();
      cleanup.deleteTarget(refFor("#a"));
      cleanup.deleteTarget(refFor("#b"));
      const mid = mutations.peekUndo()?.id;
      if (!mid) throw new Error("missing command id");
      cleanup.deleteTarget(refFor("#c"));

      expect(cleanup.undoThrough(mid)).toBe(true);
      // #c and #b undone, #a still deleted.
      expect(document.querySelector("#a")).toBeNull();
      expect(document.querySelector("#b")).not.toBeNull();
      expect(document.querySelector("#c")).not.toBeNull();
      expect(cleanup.getState().removedCount).toBe(1);
    });

    it("returns false when there is nothing to undo", () => {
      const { cleanup } = setup();
      expect(cleanup.undoThrough("none")).toBe(false);
    });

    it("drains the whole stack when the entry id is unknown", () => {
      const { cleanup } = setup();
      cleanup.deleteTarget(refFor("#a"));
      cleanup.deleteTarget(refFor("#b"));
      expect(cleanup.undoThrough("no-such-id")).toBe(true);
      expect(cleanup.getState().removedCount).toBe(0);
      expect(cleanup.undoThrough("no-such-id")).toBe(false);
    });
  });

  describe("reset", () => {
    it("restores every deleted and hidden element and zeroes all state", () => {
      const { cleanup } = setup();
      cleanup.deleteTarget(refFor("#a"));
      cleanup.hideTarget(refFor("#nl"));
      expect(cleanup.getState().removedCount).toBe(1);
      expect(cleanup.getState().hiddenCount).toBe(1);

      expect(cleanup.reset()).toBe(true);
      expect(document.querySelector("#a")).not.toBeNull();
      expect((document.querySelector("#nl") as HTMLElement).style.display).not.toBe("none");

      const state = cleanup.getState();
      expect(state.removedCount).toBe(0);
      expect(state.hiddenCount).toBe(0);
      expect(state.activeRules).toHaveLength(0);
    });

    it("returns false when there is nothing to reset", () => {
      const { cleanup } = setup();
      expect(cleanup.reset()).toBe(false);
    });

    it("undo/redo stacks are empty after reset", () => {
      const { cleanup } = setup();
      cleanup.deleteTarget(refFor("#a"));
      cleanup.reset();
      expect(cleanup.undo()).toBe(false);
      expect(cleanup.redo()).toBe(false);
    });
  });

  describe("getState", () => {
    it("reports selectedHidden for the current selection", () => {
      const { cleanup } = setup();
      pickViaInspector(cleanup, "#nl");
      expect(cleanup.getState().selectedHidden).toBe(false);
      cleanup.hideTarget(cleanup.selected as ElementReference);
      expect(cleanup.getState().selectedHidden).toBe(true);
    });

    it("returns a fresh object on every call", () => {
      const { cleanup } = setup();
      expect(cleanup.getState()).not.toBe(cleanup.getState());
    });
  });
});
