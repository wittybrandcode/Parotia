import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const dist = path.join(root, "dist");

const iconSizes = [16, 32, 48, 128];
const icons = Object.fromEntries(iconSizes.map((size) => [String(size), `icons/icon${size}.png`]));

const manifest = {
  manifest_version: 3,
  name: "Parotia",
  version: "0.2.0",
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
  permissions: ["activeTab", "scripting", "storage", "tabs", "unlimitedStorage", "downloads"],
  host_permissions: ["<all_urls>"],
  content_scripts: [],
  web_accessible_resources: [
    {
      resources: ["ui/*"],
      matches: ["<all_urls>"],
    },
  ],
};

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("[manifest] dist/manifest.json written");
