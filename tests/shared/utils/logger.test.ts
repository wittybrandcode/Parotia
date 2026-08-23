import { describe, expect, it, vi } from "vitest";
import { logger } from "@shared/utils/logger";

describe("logger", () => {
  it("silences expected diagnostic paths in the test environment", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logger.debug("debug", { tabId: 1 });
    logger.warn("warn", undefined, new Error("expected"));
    logger.error("error");
    expect(debug).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
