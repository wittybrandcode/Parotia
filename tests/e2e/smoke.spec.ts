import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

const dir = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(dir, "..", "..", "dist").replace(/\\/g, "/");

const EXTENSION_ARGS = [
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
] as const;

/**
 * Headless E2E smoke tests.
 *
 * The action-icon flow requires a user gesture that a headless session
 * cannot perform, so page-injection and capture paths are covered by the
 * vitest integration suites. These tests verify the REAL built extension
 * boots correctly: service worker, options page, extension-page APIs,
 * and that chrome:// pages do not crash the worker.
 */

async function launchContext() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "parotia-e2e-"));
  return chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [...EXTENSION_ARGS],
  });
}

async function waitForSW(context: Awaited<ReturnType<typeof launchContext>>) {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}

// ── 4.1 ─ Built extension boots: service worker registers and options render ─
test("4.1 built extension boots: service worker registers and options page renders", async () => {
  const context = await launchContext();
  try {
    const sw = await waitForSW(context);
    const extensionId = new URL(sw.url()).host;
    expect(extensionId).toMatch(/^[a-z]{32}$/);

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`chrome-extension://${extensionId}/ui/options.html`);
    await expect(page.getByRole("heading", { name: "PAROTIA", exact: true })).toBeVisible({ timeout: 15_000 });
  } finally {
    await context.close();
  }
});

// ── 4.2 ─ Extension-page APIs resolve without errors ────────────────────────
test("4.2 extension storage API works from options page", async () => {
  const context = await launchContext();
  try {
    const sw = await waitForSW(context);
    const extensionId = new URL(sw.url()).host;

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`chrome-extension://${extensionId}/ui/options.html`);
    await expect(page.getByRole("heading", { name: "PAROTIA", exact: true })).toBeVisible({ timeout: 15_000 });

    const result = await page.evaluate(() =>
      new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get(null, resolve);
      }),
    );
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  } finally {
    await context.close();
  }
});

// ── 4.3 ─ Service worker stays alive after navigating between pages ──────────
test("4.3 service worker survives navigation between pages", async () => {
  const context = await launchContext();
  try {
    const sw = await waitForSW(context);
    const swUrl = sw.url();
    expect(swUrl).toContain("service-worker.js");

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    await page.goto("https://example.org", { waitUntil: "domcontentloaded" });

    expect(sw.url()).toBe(swUrl);
  } finally {
    await context.close();
  }
});

// ── 4.4 ─ chrome:// page does not crash the service worker ──────────────────
test("4.4 navigating to chrome:// does not crash the service worker", async () => {
  const context = await launchContext();
  try {
    const sw = await waitForSW(context);
    const swUrl = sw.url();

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("chrome://version");
    await page.waitForLoadState("domcontentloaded");

    expect(sw.url()).toBe(swUrl);
  } finally {
    await context.close();
  }
});

test("4.5 staged capture opens in the real editor, draws, and consumes its save ticket", async () => {
  const context = await launchContext();
  try {
    const sw = await waitForSW(context);
    const extensionId = new URL(sw.url()).host;
    const page = context.pages()[0] ?? (await context.newPage());
    const editorUrl = `chrome-extension://${extensionId}/ui/editor.html`;
    // Stage from a different extension page so the editor's first document
    // load already contains the capability hash (a hash-only navigation would
    // correctly keep the existing React document alive).
    await page.goto(`chrome-extension://${extensionId}/ui/options.html`);

    const token = "e".repeat(48);
    const imageKey = `editor-image:${token}`;
    const ticketKey = `editor-ticket:${token}`;
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGCAMAAP//AwA0AAH9lQZsAAAAAElFTkSuQmCC";
    const tabId = await page.evaluate(async () => {
      const tab = await chrome.tabs.getCurrent();
      if (tab.id === undefined) throw new Error("Editor tab id unavailable");
      return tab.id;
    });
    await page.evaluate(async ({ key, ticket, image, tab, tokenValue }) => {
      await chrome.storage.local.set({
        [key]: image,
        [ticket]: {
          imageKey: key,
          tabId: tab,
          sessionId: "e2e-editor",
          expiresAt: Date.now() + 60_000,
        },
      });
      return tokenValue;
    }, { key: imageKey, ticket: ticketKey, image: png, tab: tabId, tokenValue: token });

    const params = encodeURIComponent(JSON.stringify({
      imageKey,
      filename: "e2e-editor.png",
      editorToken: token,
      parentOrigin: `chrome-extension://${extensionId}`,
    }));
    await page.goto(`${editorUrl}#${params}`);
    await expect(page.getByText("Parotia Editor")).toBeVisible();
    await page.waitForTimeout(250);
    if (await page.getByRole("button", { name: /save/i }).isDisabled()) {
      const loadingError = await page.locator(".nc-editor-loading").textContent();
      throw new Error(`Editor failed to load staged PNG: ${loadingError ?? "unknown error"}`);
    }
    await expect(page.getByRole("button", { name: /save/i })).toBeEnabled();

    await page.getByText("Draw", { exact: true }).click();
    await page.getByTitle("Rectangle").click();
    const surface = page.locator(".konvajs-content");
    await expect(surface).toBeVisible();
    const box = await surface.boundingBox();
    if (!box) throw new Error("Konva surface has no bounds");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
    await page.mouse.up();

    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByRole("button", { name: /saved/i })).toBeDisabled();
    const leftovers = await page.evaluate(async (key) => chrome.storage.local.get(key), ticketKey);
    expect(leftovers[ticketKey]).toBeUndefined();
  } finally {
    await context.close();
  }
});
