import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardShortcuts, type ShortcutContext } from "@content/keyboard/shortcuts";
import type { BackgroundCommand } from "@shared/types";

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("KeyboardShortcuts", () => {
  let shortcuts: KeyboardShortcuts;
  let dispatch: ReturnType<typeof vi.fn>;
  let context: ShortcutContext;

  beforeEach(() => {
    context = { frozen: false, inspecting: false, hasSelection: false };
    dispatch = vi.fn();
    shortcuts = new KeyboardShortcuts({
      getState: () => context,
      dispatch: (command: BackgroundCommand) => dispatch(command),
    });
    shortcuts.start();
  });

  afterEach(() => {
    shortcuts.stop();
  });

  it("Shift+Alt+F freezes when unfrozen and unfreezes when frozen", () => {
    window.dispatchEvent(keyEvent({ code: "KeyF", shiftKey: true, altKey: true }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "FREEZE_PAGE",
      payload: { sessionId: "" },
    });

    context.frozen = true;
    dispatch.mockClear();
    window.dispatchEvent(keyEvent({ code: "KeyF", shiftKey: true, altKey: true }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "UNFREEZE_PAGE",
      payload: { sessionId: "" },
    });
  });

  it("Shift+Alt+P toggles the picker based on the current state", () => {
    window.dispatchEvent(keyEvent({ code: "KeyP", shiftKey: true, altKey: true }));
    expect(dispatch).toHaveBeenCalledWith({ type: "INSPECT_START", payload: { sessionId: "" } });

    context.inspecting = true;
    dispatch.mockClear();
    window.dispatchEvent(keyEvent({ code: "KeyP", shiftKey: true, altKey: true }));
    expect(dispatch).toHaveBeenCalledWith({ type: "INSPECT_STOP", payload: { sessionId: "" } });
  });

  it("ignores Ctrl+Shift+Alt combos (browser shortcuts are never hijacked)", () => {
    window.dispatchEvent(keyEvent({ code: "KeyF", ctrlKey: true, shiftKey: true, altKey: true }));
    window.dispatchEvent(keyEvent({ code: "KeyF", metaKey: true, shiftKey: true, altKey: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Escape stops the picker only while inspecting", () => {
    window.dispatchEvent(keyEvent({ key: "Escape" }));
    expect(dispatch).not.toHaveBeenCalled();

    context.inspecting = true;
    window.dispatchEvent(keyEvent({ key: "Escape" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "INSPECT_STOP", payload: { sessionId: "" } });
  });

  it("Delete removes the selected element only while picking with a selection", () => {
    window.dispatchEvent(keyEvent({ key: "Delete" }));
    expect(dispatch).not.toHaveBeenCalled();

    context.inspecting = true;
    context.hasSelection = false;
    window.dispatchEvent(keyEvent({ key: "Delete" }));
    expect(dispatch).not.toHaveBeenCalled();

    context.hasSelection = true;
    window.dispatchEvent(keyEvent({ key: "Delete" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "DELETE_ELEMENT", payload: { sessionId: "", elementId: "" } });

    dispatch.mockClear();
    window.dispatchEvent(keyEvent({ key: "Backspace" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "DELETE_ELEMENT", payload: { sessionId: "", elementId: "" } });
  });

  it("never hijacks typing inside inputs, textareas or contenteditable", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    input.dispatchEvent(keyEvent({ code: "KeyF", shiftKey: true, altKey: true }));
    input.dispatchEvent(keyEvent({ key: "Delete" }));
    expect(dispatch).not.toHaveBeenCalled();

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
    editable.dispatchEvent(keyEvent({ code: "KeyP", shiftKey: true, altKey: true }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
