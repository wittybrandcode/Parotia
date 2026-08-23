import { beforeEach, describe, expect, it } from "vitest";
import type { Mock } from "vitest";
import { purgeEditorDataForTab, purgeStaleCaptureData } from "@background/temporaryStorage";

const local = chrome.storage.local as unknown as {
  get: Mock;
  remove: Mock;
};

describe("temporary storage cleanup", () => {
  beforeEach(() => {
    local.get.mockReset();
    local.remove.mockReset().mockResolvedValue(undefined);
  });

  it("removes capture payloads, expired tickets and orphaned editor images only", async () => {
    local.get.mockResolvedValue({
      "capture:stale": "png",
      "elementcapture:stale": "png",
      "regioncapture:stale": "png",
      "editor-ticket:live": { imageKey: "editor-image:live", tabId: 1, sessionId: "s", expiresAt: 200 },
      "editor-image:live": "png",
      "editor-ticket:expired": { imageKey: "editor-image:expired", tabId: 2, sessionId: "s", expiresAt: 99 },
      "editor-image:expired": "png",
      "editor-image:orphan": "png",
      preference: true,
    });

    await purgeStaleCaptureData(100);
    const removed = local.remove.mock.calls[0]?.[0] as string[];
    expect(removed).toEqual(expect.arrayContaining([
      "capture:stale",
      "elementcapture:stale",
      "regioncapture:stale",
      "editor-ticket:expired",
      "editor-image:expired",
      "editor-image:orphan",
    ]));
    expect(removed).not.toContain("editor-image:live");
    expect(removed).not.toContain("preference");
    expect(new Set(removed).size).toBe(removed.length);
  });

  it("does not write when there is nothing stale", async () => {
    local.get.mockResolvedValue({ preference: true });
    await purgeStaleCaptureData();
    expect(local.remove).not.toHaveBeenCalled();
  });

  it("is best effort when storage is unavailable", async () => {
    local.get.mockRejectedValue(new Error("unavailable"));
    await expect(purgeStaleCaptureData()).resolves.toBeUndefined();
  });

  it("removes only editor data owned by a closed tab", async () => {
    local.get.mockResolvedValue({
      "editor-ticket:closed": { imageKey: "editor-image:closed", tabId: 4, expiresAt: 999 },
      "editor-image:closed": "png",
      "editor-ticket:open": { imageKey: "editor-image:open", tabId: 5, expiresAt: 999 },
      "editor-image:open": "png",
    });
    await purgeEditorDataForTab(4);
    expect(local.remove).toHaveBeenCalledWith(["editor-ticket:closed", "editor-image:closed"]);
  });
});
