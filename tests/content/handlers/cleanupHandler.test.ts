import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "@content/handlers/types";
import type { ElementReference } from "@shared/types";
import { handleCleanupCommand } from "@content/handlers/cleanupHandler";

const selected: ElementReference = {
  id: "picked-1",
  selector: "#picked",
  tagName: "DIV",
};

function command(type: string, payload: Record<string, unknown> = {}) {
  return { type, payload } as never;
}

function makeCleanup(overrides: Record<string, unknown> = {}) {
  return {
    inspecting: false,
    selected,
    startInspecting: vi.fn(),
    stopInspecting: vi.fn(),
    deleteTarget: vi.fn(() => true),
    hideTarget: vi.fn(() => true),
    showSelected: vi.fn(() => true),
    previewSimilarTargets: vi.fn(() => null),
    confirmDeleteSimilar: vi.fn(() => 1),
    showPreview: vi.fn(),
    clearPreview: vi.fn(),
    setDeleteSimilarPreview: vi.fn(),
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    undoThrough: vi.fn(() => true),
    reset: vi.fn(() => true),
    ...overrides,
  };
}

function makeContext(cleanup = makeCleanup()): HandlerContext {
  return {
    session: null,
    overlay: null,
    cleanup: cleanup as never,
    stitcher: null,
    shortcuts: null,
    fixedHeaders: {} as never,
    mutations: {} as never,
    freeze: {} as never,
    extraction: {} as never,
    elementCapture: {} as never,
    deleteSimilarPreviews: new Map(),
    deleteSimilarToken: null,
    broadcastState: vi.fn(),
    ensureRuntime: vi.fn(),
    dispatch: vi.fn(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("cleanup command handler", () => {
  it("starts or stops inspection and broadcasts the resulting state", async () => {
    const inactive = makeCleanup();
    const inactiveContext = makeContext(inactive);
    expect(await handleCleanupCommand(command("INSPECT_START"), inactiveContext)).toEqual({ active: false });
    expect(inactive.startInspecting).toHaveBeenCalledOnce();
    expect(inactiveContext.broadcastState).toHaveBeenCalledOnce();

    const active = makeCleanup({ inspecting: true });
    const activeContext = makeContext(active);
    expect(await handleCleanupCommand(command("INSPECT_START"), activeContext)).toEqual({ active: true });
    expect(active.stopInspecting).toHaveBeenCalledOnce();

    expect(await handleCleanupCommand(command("INSPECT_STOP"), activeContext)).toEqual({ active: false });
    expect(active.stopInspecting).toHaveBeenCalledTimes(2);
    expect(activeContext.broadcastState).toHaveBeenCalledTimes(2);
  });

  it("treats absent cleanup engines as inactive and safe no-ops", async () => {
    const ctx = makeContext();
    ctx.cleanup = null;

    expect(await handleCleanupCommand(command("INSPECT_START"), ctx)).toEqual({ active: false });
    expect(await handleCleanupCommand(command("INSPECT_STOP"), ctx)).toEqual({ active: false });
    expect(await handleCleanupCommand(command("DELETE_ELEMENT"), ctx)).toEqual({ success: false });
    expect(await handleCleanupCommand(command("HIDE_ELEMENT"), ctx)).toEqual({ success: false });
    expect(await handleCleanupCommand(command("SHOW_ELEMENT"), ctx)).toEqual({ success: false });
    expect(await handleCleanupCommand(command("DELETE_MATCHING"), ctx)).toEqual({
      success: false,
      error: "No element selected",
    });
    expect(await handleCleanupCommand(command("UNDO"), ctx)).toEqual({ success: false });
    expect(await handleCleanupCommand(command("REDO"), ctx)).toEqual({ success: false });
    expect(await handleCleanupCommand(command("RESET"), ctx)).toEqual({ success: false });
  });

  it("deletes, hides and shows the current selection", async () => {
    const cleanup = makeCleanup();
    const ctx = makeContext(cleanup);

    expect(await handleCleanupCommand(command("DELETE_ELEMENT"), ctx)).toEqual({ success: true });
    expect(cleanup.deleteTarget).toHaveBeenCalledWith(selected);
    expect(await handleCleanupCommand(command("HIDE_ELEMENT"), ctx)).toEqual({ success: true });
    expect(cleanup.hideTarget).toHaveBeenCalledWith(selected);
    expect(await handleCleanupCommand(command("SHOW_ELEMENT"), ctx)).toEqual({ success: true });
    expect(cleanup.showSelected).toHaveBeenCalledOnce();
    expect(ctx.broadcastState).toHaveBeenCalledTimes(3);
  });

  it("does not mutate when delete or hide has no current selection", async () => {
    const cleanup = makeCleanup({ selected: null });
    const ctx = makeContext(cleanup);

    expect(await handleCleanupCommand(command("DELETE_ELEMENT"), ctx)).toEqual({ success: false });
    expect(await handleCleanupCommand(command("HIDE_ELEMENT"), ctx)).toEqual({ success: false });
    expect(cleanup.deleteTarget).not.toHaveBeenCalled();
    expect(cleanup.hideTarget).not.toHaveBeenCalled();
  });

  it("refuses a similar-elements preview without a selection", async () => {
    const ctx = makeContext(makeCleanup({ selected: null }));
    expect(await handleCleanupCommand(command("DELETE_MATCHING"), ctx)).toEqual({
      success: false,
      error: "No element selected",
    });
  });

  it.each([
    ["no preview", null],
    ["empty preview", { count: 0, signatures: [], elements: [] }],
  ])("clears a %s similar-elements preview", async (_label, preview) => {
    const cleanup = makeCleanup({ previewSimilarTargets: vi.fn(() => preview) });
    const ctx = makeContext(cleanup);

    expect(await handleCleanupCommand(command("DELETE_MATCHING"), ctx)).toEqual({
      success: false,
      error: "No similar elements found",
    });
    expect(cleanup.clearPreview).toHaveBeenCalledOnce();
    expect(cleanup.setDeleteSimilarPreview).toHaveBeenCalledWith(null);
  });

  it("creates a short-lived token and displays a valid similar-elements preview", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const elements = [document.createElement("div"), document.createElement("div")];
    const preview = { count: 2, signatures: ["a", "b"], elements };
    const cleanup = makeCleanup({ previewSimilarTargets: vi.fn(() => preview) });
    const ctx = makeContext(cleanup);

    const result = await handleCleanupCommand(command("DELETE_MATCHING"), ctx) as {
      success: boolean;
      data: { count: number; token: string; previewActive: boolean };
    };

    expect(result).toEqual({
      success: true,
      data: { count: 2, token: expect.stringMatching(/^preview-/), previewActive: true },
    });
    expect(ctx.deleteSimilarToken).toBe(result.data.token);
    expect(ctx.deleteSimilarPreviews.get(result.data.token)).toEqual({
      signatures: ["a", "b"],
      expires: 61_000,
    });
    expect(cleanup.showPreview).toHaveBeenCalledWith(elements);
    expect(cleanup.setDeleteSimilarPreview).toHaveBeenCalledWith(2);
  });

  it.each([
    ["missing", undefined, undefined],
    ["expired", "expired-token", { signatures: ["a"], expires: 999 }],
  ])("rejects a %s confirmation token and clears its preview", async (_label, token, preview) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const cleanup = makeCleanup();
    const ctx = makeContext(cleanup);
    if (token && preview) ctx.deleteSimilarPreviews.set(token, preview);
    ctx.deleteSimilarToken = token ?? "old-token";

    expect(await handleCleanupCommand(command("DELETE_MATCHING", {
      confirm: true,
      ...(token ? { token } : {}),
    }), ctx)).toEqual({
      success: false,
      error: "Preview expired — pick the element and try again",
    });
    expect(ctx.deleteSimilarPreviews.has(token ?? "")).toBe(false);
    expect(ctx.deleteSimilarToken).toBeNull();
    expect(cleanup.clearPreview).toHaveBeenCalledOnce();
    expect(cleanup.setDeleteSimilarPreview).toHaveBeenCalledWith(null);
  });

  it.each([
    [2, true],
    [0, false],
  ])("confirms an unchanged preview with count %i", async (count, success) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const cleanup = makeCleanup({ confirmDeleteSimilar: vi.fn(() => count) });
    const ctx = makeContext(cleanup);
    ctx.deleteSimilarPreviews.set("valid-token", { signatures: ["a", "b"], expires: 2_000 });
    ctx.deleteSimilarToken = "valid-token";

    expect(await handleCleanupCommand(command("DELETE_MATCHING", {
      confirm: true,
      token: "valid-token",
    }), ctx)).toEqual({ success, data: { count } });
    expect(cleanup.confirmDeleteSimilar).toHaveBeenCalledWith(selected, ["a", "b"]);
    expect(cleanup.setDeleteSimilarPreview).toHaveBeenCalledWith(null);
    expect(ctx.deleteSimilarPreviews.has("valid-token")).toBe(false);
    expect(ctx.deleteSimilarToken).toBeNull();
    expect(ctx.broadcastState).toHaveBeenCalledOnce();
  });

  it("delegates undo, redo, targeted undo and reset with state broadcasts", async () => {
    const cleanup = makeCleanup();
    const ctx = makeContext(cleanup);

    expect(await handleCleanupCommand(command("UNDO"), ctx)).toEqual({ success: true });
    expect(await handleCleanupCommand(command("REDO"), ctx)).toEqual({ success: true });
    expect(await handleCleanupCommand(command("UNDO_TO", { entryId: "history-2" }), ctx)).toEqual({
      success: true,
      undone: true,
    });
    expect(await handleCleanupCommand(command("RESET"), ctx)).toEqual({ success: true });

    expect(ctx.ensureRuntime).toHaveBeenCalledOnce();
    expect(cleanup.undoThrough).toHaveBeenCalledWith("history-2");
    expect(ctx.broadcastState).toHaveBeenCalledTimes(4);
  });

  it("reports an unavailable targeted undo after ensuring the runtime", async () => {
    const ctx = makeContext();
    ctx.cleanup = null;

    expect(await handleCleanupCommand(command("UNDO_TO", { entryId: "gone" }), ctx)).toEqual({
      success: true,
      undone: false,
    });
    expect(ctx.ensureRuntime).toHaveBeenCalledOnce();
    expect(ctx.broadcastState).toHaveBeenCalledOnce();
  });
});
