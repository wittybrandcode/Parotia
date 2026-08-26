import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";
import sharp from "sharp";

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
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const editorUrl = `chrome-extension://${extensionId}/ui/editor.html`;
    // Stage from a different extension page so the editor's first document
    // load already contains the capability hash (a hash-only navigation would
    // correctly keep the existing React document alive).
    await page.goto(`chrome-extension://${extensionId}/ui/options.html`);

    const token = "e".repeat(48);
    const imageKey = `editor-image:${token}`;
    const ticketKey = `editor-ticket:${token}`;
    const pngBuffer = await sharp({ create: { width: 320, height: 180, channels: 4, background: { r: 245, g: 245, b: 245, alpha: 1 } } }).png().toBuffer();
    const png = `data:image/png;base64,${pngBuffer.toString("base64")}`;
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
    await expect(page.getByRole("complementary", { name: "Layers panel" })).toBeVisible();
    await expect(page.getByText(/create the first editable layer/i)).toBeVisible();
    await expect(page.getByTitle("Freehand")).toBeVisible();
    await expect(page.getByTitle("Callout")).toBeVisible();
    await expect(page.getByTitle("Step marker")).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Text size" })).toBeVisible();
    const snapToggle = page.getByRole("button", { name: "Snap" });
    await expect(snapToggle).toHaveAttribute("aria-pressed", "true");
    await snapToggle.click();
    await expect(snapToggle).toHaveAttribute("aria-pressed", "false");
    await snapToggle.click();

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

    const textTool = page.getByTitle("Point text");
    await expect(page.getByTitle("Paragraph text — drag a box")).toBeVisible();
    await textTool.click();
    await expect(textTool).toHaveClass(/nc-editor-shape-btn-active/);
    const editorSurface = page.locator(".nc-editor-konva-container");
    await expect(editorSurface).toHaveCSS("cursor", "text");
    const textPoint = { x: box.x + box.width * 0.05, y: box.y + box.height * 0.05 };
    await page.mouse.click(textPoint.x, textPoint.y);
    const textInput = page.locator(".nc-editor-inline-text-input");
    await expect(textInput).toBeVisible();
    await textInput.fill("Editable caption");
    await textInput.press("Enter");
    await expect(page.getByRole("option", { name: /^Text \d+/ })).toBeVisible();
    const layerText = page.getByRole("textbox", { name: "Layer text" });
    await expect(layerText).toHaveValue("Editable caption");
    await layerText.fill("نص عربي قابل للتحرير\nعلى أكثر من سطر");
    await layerText.press("Control+Enter");
    await expect(layerText).toHaveValue("نص عربي قابل للتحرير\nعلى أكثر من سطر");
    await page.getByRole("combobox", { name: "Text direction" }).selectOption("rtl");
    await page.getByRole("combobox", { name: "Text type" }).selectOption("paragraph");
    await page.getByRole("button", { name: "Justify text" }).click();
    const justifyRight = page.getByRole("button", { name: "Justify with last line right" });
    await expect(page.getByRole("button", { name: "Justify with last line left" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Justify with last line centered" })).toBeVisible();
    await justifyRight.click();
    await expect(justifyRight).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Text line height").fill("1.5");
    await page.getByLabel("Text line height").press("Enter");
    await page.getByLabel("Text box width").fill("240");
    await page.getByLabel("Text box width").press("Enter");
    await page.getByLabel("Text background enabled").check();
    await page.getByRole("combobox", { name: "Text preset" }).selectOption("quote");
    await expect(page.getByRole("combobox", { name: "Layer font" })).toHaveValue("Georgia");
    await expect(page.getByRole("button", { name: /local fonts/i })).toBeVisible();

    const paragraphTool = page.getByTitle("Paragraph text — drag a box");
    await paragraphTool.click();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.15);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.38);
    await page.mouse.up();
    const paragraphInput = page.getByRole("textbox", { name: "Enter paragraph text" });
    await expect(paragraphInput).toBeVisible();
    await paragraphInput.fill("Paragraph line one\nParagraph line two");
    await paragraphInput.press("Control+Enter");
    await expect(page.getByRole("option", { name: /^Text \d+/ })).toHaveCount(2);
    await page.keyboard.press("Delete");
    await expect(page.getByRole("option", { name: /^Text \d+/ })).toHaveCount(1);

    const layerList = page.getByRole("listbox", { name: "Document layers" });
    const rectangleLayer = layerList.getByRole("option", { name: /Rectangle 1/ });
    const textLayer = layerList.getByRole("option", { name: /^Text \d+/ });
    await rectangleLayer.dragTo(textLayer, { targetPosition: { x: 30, y: 1 } });
    await expect(layerList.getByRole("option").first()).toContainText("Rectangle 1");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(layerList.getByRole("option").first()).toContainText(/^Text \d+/);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(layerList.getByRole("option").first()).toContainText("Rectangle 1");

    await rectangleLayer.click();
    await textLayer.click({ modifiers: ["Control"] });
    await expect(page.getByRole("button", { name: "Group", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await expect(layerList.getByRole("option")).toHaveCount(1);
    await expect(layerList.getByRole("option")).toContainText("Group");
    await expect(page.getByRole("button", { name: "Ungroup" })).toBeEnabled();
    await page.getByRole("button", { name: "Ungroup" }).click();
    await expect(layerList.getByRole("option")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Align left" })).toBeVisible();
    await page.getByRole("button", { name: "Align left" }).click();
    await page.keyboard.press("Control+D");
    await expect(layerList.getByRole("option")).toHaveCount(4);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(layerList.getByRole("option")).toHaveCount(2);

    await page.getByText("Draw", { exact: true }).click();
    await page.getByTitle("Step marker").click();
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
    await expect(layerList.getByRole("option", { name: /Step 1/ })).toBeVisible();
    await expect(layerList.getByRole("option", { name: /Step 2/ })).toBeVisible();
    await page.keyboard.press("Control+D");
    await expect(layerList.getByRole("option", { name: /Step 3/ })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();

    await rectangleLayer.click();
    await page.getByRole("button", { name: "Copy layer style" }).click();
    await layerList.getByRole("option", { name: /Step 1/ }).click();
    await page.getByRole("button", { name: "Paste layer style" }).click();
    await expect(page.getByLabel("Layer stroke color")).toHaveValue("#c1e899");
    await page.getByRole("combobox", { name: "Shape preset" }).selectOption("alert");
    await expect(page.getByRole("combobox", { name: "Layer stroke style" })).toHaveValue("dashed");

    await page.getByText("Draw", { exact: true }).click();
    await page.getByTitle("Arrow").click();
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.75);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.25);
    await page.mouse.up();
    await page.getByRole("combobox", { name: "Arrow heads" }).selectOption("both");
    await page.getByRole("combobox", { name: "Layer stroke style" }).selectOption("dotted");
    await page.getByRole("button", { name: "Reverse direction" }).click();
    await expect(page.getByRole("combobox", { name: "Arrow heads" })).toHaveValue("both");

    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByRole("button", { name: /saved/i })).toBeDisabled();
    const leftovers = await page.evaluate(async (key) => chrome.storage.local.get(key), ticketKey);
    expect(leftovers[ticketKey]).toBeUndefined();
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
