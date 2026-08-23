import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const dist = path.join(root, "dist");

const iconSizes = [16, 32, 48, 128];
const icons = Object.fromEntries(iconSizes.map((size) => [String(size), `icons/icon${size}.png`]));

// Single source of truth for the extension version.
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const manifest = {
  manifest_version: 3,
  name: "Parotia",
  version,
  description: "clean the stage. keep the story. — Freeze, inspect, clean and capture news pages as broadcast-ready PNGs.",
  homepage_url: "https://github.com/wittybrandcode/Parotia",
  minimum_chrome_version: "120",
  icons,
  action: {
    default_title: "Parotia",
    default_icon: icons,
  },
  background: {
    service_worker: "background/service-worker.js",
  },
  options_ui: {
    page: "ui/options.html",
    open_in_tab: true,
  },
  // `activeTab` grants temporary access to the page the user explicitly
  // activates; `scripting` scopes injection to that session. `downloads` is
  // required because MV3 service workers cannot call `permissions.request()`
  // (only extension pages may), so the permission must be declared upfront.
  // `tabs` is required for `setZoom` / `getZoom` used during element capture.
  // `unlimitedStorage` is needed because full-page captures at 2x DPR can
  // exceed the default 5 MB chrome.storage.local quota while staging data
  // between the content script and the service worker.
  permissions: ["activeTab", "scripting", "storage", "tabs", "unlimitedStorage", "downloads"],
  optional_permissions: [],
  content_scripts: [],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
  web_accessible_resources: [
    {
      resources: [
        "ui/index.html",
        "ui/editor.html",
        "ui/assets/*",
      ],
      matches: ["*://*/*"],
    },
  ],
};

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("[manifest] dist/manifest.json written");
