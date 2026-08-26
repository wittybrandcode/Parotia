import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundCommand } from "@shared/types";
import { createEditorToken, EditorTicketManager } from "@background/editorTickets";

type EditorResultCommand = Extract<BackgroundCommand, {
  type: "DOWNLOAD_EDITOR_RESULT" | "DISCARD_EDITOR_RESULT";
}>;

const local = chrome.storage.local as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};
const downloads = chrome.downloads.download as unknown as ReturnType<typeof vi.fn>;

const editorUrl = "chrome-extension://parotia/ui/editor.html";
const trustedSender = {
  url: editorUrl,
  tab: { id: 4 },
} as chrome.runtime.MessageSender;

function discard(editorToken = "token"): EditorResultCommand {
  return { type: "DISCARD_EDITOR_RESULT", payload: { editorToken } };
}

function download(editorToken = "token"): EditorResultCommand {
  return {
    type: "DOWNLOAD_EDITOR_RESULT",
    payload: { editorToken, dataUrl: "data:image/png;base64,valid", filename: "result.png" },
  };
}

function ticket(expiresAt = Date.now() + 60_000) {
  return { imageKey: "editor-image:token", tabId: 4, sessionId: "session-4", expiresAt };
}

describe("EditorTicketManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    local.get.mockResolvedValue({});
    local.set.mockResolvedValue(undefined);
    local.remove.mockResolvedValue(undefined);
    downloads.mockResolvedValue(27);
  });

  it("creates an unpredictable 192-bit hexadecimal token", () => {
    const token = createEditorToken();
    expect(token).toMatch(/^[a-f0-9]{48}$/);
  });

  it("stages and revokes the image and its one-time ticket", async () => {
    const manager = new EditorTicketManager();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    const staged = await manager.stage(4, "session-4", "data:image/png;base64,source");
    expect(staged.editorToken).toMatch(/^[a-f0-9]{48}$/);
    expect(staged.imageKey).toBe(`editor-image:${staged.editorToken}`);
    expect(staged.ticketKey).toBe(`editor-ticket:${staged.editorToken}`);
    expect(local.set).toHaveBeenCalledWith({
      [staged.imageKey]: "data:image/png;base64,source",
      [staged.ticketKey]: {
        imageKey: staged.imageKey,
        tabId: 4,
        sessionId: "session-4",
        expiresAt: 601_000,
      },
    });

    await manager.revoke(staged.imageKey, staged.ticketKey);
    expect(local.remove).toHaveBeenLastCalledWith([staged.imageKey, staged.ticketKey]);
    now.mockRestore();
  });

  it.each([
    [undefined, ["editor-ticket:token"]],
    [{ imageKey: 12, tabId: 4, expiresAt: Date.now() + 60_000 }, ["editor-ticket:token"]],
    [{ imageKey: "editor-image:token", tabId: 4, expiresAt: "later" }, ["editor-ticket:token", "editor-image:token"]],
    [ticket(Date.now() - 1), ["editor-ticket:token", "editor-image:token"]],
  ])("rejects and clears an invalid or expired ticket %#", async (storedTicket, expectedRemoval) => {
    local.get.mockImplementation(async (key: unknown) => key === null ? {} : { "editor-ticket:token": storedTicket });
    const manager = new EditorTicketManager();

    await expect(manager.consume(discard(), trustedSender, editorUrl)).rejects.toThrow("expired or invalid token");
    expect(local.remove).toHaveBeenCalledWith(expectedRemoval);
  });

  it.each([
    [{}, editorUrl],
    [{ url: "not a URL", tab: { id: 4 } }, editorUrl],
    [{ url: "chrome-extension://other/ui/editor.html", tab: { id: 4 } }, editorUrl],
    [{ url: "chrome-extension://parotia/ui/options.html", tab: { id: 4 } }, editorUrl],
    [trustedSender, "not a URL"],
  ])("rejects an untrusted editor boundary %#", async (sender, expectedUrl) => {
    const manager = new EditorTicketManager();
    await expect(manager.consume(discard(), sender as chrome.runtime.MessageSender, expectedUrl)).rejects.toThrow("untrusted sender");
    expect(local.get).not.toHaveBeenCalled();
  });

  it("rejects a valid ticket used from a different tab", async () => {
    local.get.mockImplementation(async (key: unknown) => key === null ? {} : { "editor-ticket:token": ticket() });
    const manager = new EditorTicketManager();
    const sender = { ...trustedSender, tab: { id: 9 } } as chrome.runtime.MessageSender;

    await expect(manager.consume(discard(), sender, editorUrl)).rejects.toThrow("sender tab does not own token");
    expect(local.remove).not.toHaveBeenCalledWith(["editor-ticket:token", "editor-image:token"]);
  });

  it("consumes a discard capability before returning success", async () => {
    local.get.mockImplementation(async (key: unknown) => key === null ? {} : { "editor-ticket:token": ticket() });
    const manager = new EditorTicketManager();

    await expect(manager.consume(discard(), trustedSender, editorUrl)).resolves.toEqual({ success: true });
    expect(local.remove).toHaveBeenCalledWith(["editor-ticket:token", "editor-image:token"]);
    expect(downloads).not.toHaveBeenCalled();
  });

  it("consumes a download capability and returns its filename", async () => {
    local.get.mockImplementation(async (key: unknown) => key === null ? {} : { "editor-ticket:token": ticket() });
    const manager = new EditorTicketManager();

    await expect(manager.consume(download(), trustedSender, editorUrl)).resolves.toEqual({
      success: true,
      filename: "result.png",
    });
    expect(downloads).toHaveBeenCalledWith(expect.objectContaining({ filename: "result.png" }));
  });

  it("keeps a failed download non-replayable and releases its in-flight lock", async () => {
    local.get.mockImplementation(async (key: unknown) => key === null ? {} : { "editor-ticket:token": ticket() });
    downloads.mockRejectedValue(new Error("disk full"));
    const manager = new EditorTicketManager();

    await expect(manager.consume(download(), trustedSender, editorUrl)).rejects.toThrow("Failed to save the file");
    expect(local.remove).toHaveBeenCalledWith(["editor-ticket:token", "editor-image:token"]);
    await expect(manager.consume(download(), trustedSender, editorUrl)).rejects.toThrow("Failed to save the file");
  });

  it("rejects concurrent consumption of the same token", async () => {
    let releaseTicket: ((value: Record<string, unknown>) => void) | undefined;
    const delayedTicket = new Promise<Record<string, unknown>>((resolve) => {
      releaseTicket = resolve;
    });
    local.get.mockImplementation((key: unknown) => key === null ? Promise.resolve({}) : delayedTicket);
    const manager = new EditorTicketManager();

    const first = manager.consume(discard(), trustedSender, editorUrl);
    await vi.waitFor(() => expect(local.get).toHaveBeenCalledWith("editor-ticket:token"));
    await expect(manager.consume(discard(), trustedSender, editorUrl)).rejects.toThrow("already being consumed");

    releaseTicket?.({ "editor-ticket:token": ticket() });
    await expect(first).resolves.toEqual({ success: true });
  });
});
