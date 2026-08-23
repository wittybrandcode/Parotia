import { describe, expect, it } from "vitest";
import { EditorHistory } from "@ui/src/editor/EditorHistory";

describe("EditorHistory", () => {
  it("undoes and redoes mixed visible snapshots in order", () => {
    const history = new EditorHistory();
    history.initialize("base");
    history.commit("draw");
    history.commit("crop");
    history.commit("adjust");
    expect(history.undo()).toBe("crop");
    expect(history.undo()).toBe("draw");
    expect(history.undo()).toBe("base");
    expect(history.redo()).toBe("draw");
    expect(history.redo()).toBe("crop");
    expect(history.redo()).toBe("adjust");
  });

  it("bounds retained history by entries and memory", () => {
    const history = new EditorHistory(2, 12);
    history.initialize("0000");
    history.commit("1111");
    history.commit("2222");
    history.commit("3333");
    expect(history.undo()).toBe("2222");
    expect(history.undo()).toBe("1111");
    expect(history.undo()).toBeNull();
  });

  it("clears redo after a new commit", () => {
    const history = new EditorHistory();
    history.initialize("a");
    history.commit("b");
    history.undo();
    history.commit("c");
    expect(history.canRedo).toBe(false);
  });
});
