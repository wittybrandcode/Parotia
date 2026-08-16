import { describe, expect, it } from "vitest";
import { HistoryEngine, type Command } from "@content/mutation/history";

function command(label: string, calls: string[]): Command {
  return {
    id: label,
    label,
    execute: () => calls.push(`+${label}`),
    undo: () => calls.push(`-${label}`),
  };
}

describe("HistoryEngine", () => {
  it("pushes and undoes in LIFO order", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    history.push(command("b", calls));

    expect(history.canUndo).toBe(true);
    expect(history.undoLabel).toBe("b");

    const undone = history.undo();
    expect(undone?.label).toBe("b");
    expect(calls).toEqual(["-b"]);
  });

  it("redoes after undo", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    history.undo();
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(calls).toEqual(["-a", "+a"]);
  });

  it("clears the redo stack when a new command is pushed", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    history.undo();
    history.push(command("b", calls));
    expect(history.canRedo).toBe(false);
  });

  it("caps the undo stack at maxOperations", () => {
    const history = new HistoryEngine(3);
    const calls: string[] = [];
    for (let i = 0; i < 5; i++) history.push(command(`c${i}`, calls));

    let undone = 0;
    while (history.undo()) undone += 1;
    expect(undone).toBe(3);
    expect(calls).toEqual(["-c4", "-c3", "-c2"]);
  });

  it("reset drains the stack without executing undo", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    history.push(command("b", calls));

    const drained = history.reset();
    expect(drained.map((c) => c.label)).toEqual(["a", "b"]);
    expect(calls).toEqual([]);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("undo/redo return null when empty", () => {
    const history = new HistoryEngine();
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
    expect(history.canUndo).toBe(false);
  });

  it("log() lists entries newest first with timestamps and undoable flags", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    history.push(command("b", calls));

    const log = history.log();
    expect(log.map((e) => e.label)).toEqual(["b", "a"]);
    expect(log.every((e) => typeof e.at === "number" && e.at > 0)).toBe(true);
    expect(log.every((e) => e.undoable)).toBe(true);
  });

  it("log() marks undone entries as non-undoable (they moved to redo)", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    history.push(command("b", calls));
    history.undo();

    const log = history.log();
    expect(log.find((e) => e.label === "b")?.undoable).toBe(false);
    expect(log.find((e) => e.label === "a")?.undoable).toBe(true);
  });

  it("peekUndo returns the next command that Undo would revert", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    expect(history.peekUndo()?.id).toBe("a");
    history.push(command("b", calls));
    expect(history.peekUndo()?.id).toBe("b");
    history.undo();
    expect(history.peekUndo()?.id).toBe("a");
  });

  it("undoTo undoes entries until the target entry is undone", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    history.push(command("b", calls));
    history.push(command("c", calls));

    const undone = history.undoTo("b");
    expect(undone?.id).toBe("b");
    expect(calls).toEqual(["-c", "-b"]);
    expect(history.undoLabel).toBe("a");
  });

  it("undoTo drains the stack when the target is not present", () => {
    const history = new HistoryEngine();
    const calls: string[] = [];
    history.push(command("a", calls));
    const undone = history.undoTo("missing");
    expect(undone?.id).toBe("a");
    expect(history.canUndo).toBe(false);
    expect(calls).toEqual(["-a"]);
  });
});
