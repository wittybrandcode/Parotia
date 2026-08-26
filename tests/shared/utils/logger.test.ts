import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@shared/utils/logger";

describe("logger", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

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

  it("writes structured diagnostics when logging is enabled", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const enabledLogger = (await import("@shared/utils/logger")).logger;
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = new Error("network");

    enabledLogger.debug("boot");
    enabledLogger.warn("retry", { attempt: 2 }, cause);
    enabledLogger.error("failed", undefined, null);

    expect(debug).toHaveBeenCalledWith("[parotia]", { event: "boot" }, "");
    expect(warn).toHaveBeenCalledWith("[parotia]", { event: "retry", attempt: 2 }, cause);
    expect(error).toHaveBeenCalledWith("[parotia]", { event: "failed" }, "");
  });
});
