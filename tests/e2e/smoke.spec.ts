import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

const dir = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(dir, "..", "..", "dist").replace(/\\/g, "/");

/**
 * Headless E2E smoke test.
 *
 * The action-icon flow (which grants `activeTab` so the content script may be
 * injected into a real page) requires a user gesture that a headless session
 * cannot perform, so page-injection and capture paths are covered by the vitest
 * integration suites instead. Here we verify the REAL built extension boots:
 * the MV3 service worker registers and the options page renders against real
 * chrome.storage with no injected mocks.
 */
test("built extension boots: service worker registers and options page renders", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "parotia-e2e-"));
  // `channel: "chromium"` runs the FULL chromium build in new-headless mode.
  // The default headless-shell build does not support extensions, so the MV3
  // service worker would never register there.
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  try {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    expect(sw).toBeTruthy();
    const extensionId = new URL(sw.url()).host;
    expect(extensionId).toMatch(/^[a-z]{32}$/);

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`chrome-extension://${extensionId}/ui/options.html`);
    await expect(page.getByRole("heading", { name: "Parotia — Site Presets" })).toBeVisible({ timeout: 15_000 });
  } finally {
    await context.close();
  }
});
