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
  // Least privilege (SECURITY doc §7): no `tabs` (only basic tab ids are
  // used), no broad host permissions — `activeTab` grants temporary access to
  // the page the user explicitly activates, and `scripting` scopes injection
  // to that session. `downloads` stays optional and is requested on first export.
  permissions: ["activeTab", "scripting", "storage", "unlimitedStorage"],
  optional_permissions: ["downloads"],
  content_scripts: [],
  web_accessible_resources: [
    {
      resources: ["ui/*"],
      matches: ["http://*/*", "https://*/*"],
    },
  ],
};

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("[manifest] dist/manifest.json written");
