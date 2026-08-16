import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");

const targets = {
  content: {
    entryPoints: [path.join(root, "src/content/index.ts")],
    outfile: path.join(root, "dist/content/index.js"),
  },
  background: {
    entryPoints: [path.join(root, "src/background/service-worker.ts")],
    outfile: path.join(root, "dist/background/service-worker.js"),
  },
};

const which = process.argv[2];
if (!which || !Object.prototype.hasOwnProperty.call(targets, which)) {
  console.error("Usage: node scripts/build-esm.mjs <content|background>");
  process.exit(1);
}

const target = targets[which];

await build({
  entryPoints: target.entryPoints,
  bundle: true,
  format: "iife",
  outfile: target.outfile,
  minify: false,
  sourcemap: false,
  target: "chrome120",
  legalComments: "none",
  logLevel: "info",
  alias: {
    "@shared": path.join(root, "src/shared"),
    "@storage": path.join(root, "src/storage"),
    "@presets": path.join(root, "src/presets"),
    "@content": path.join(root, "src/content"),
    "@background": path.join(root, "src/background"),
    "@ui": path.join(root, "src/ui"),
  },
});

console.log(`[esbuild] ${which} → ${target.outfile}`);
