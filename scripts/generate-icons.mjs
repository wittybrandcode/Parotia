import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const source = path.join(root, "src", "ui", "favicon.svg");
const outDirs = [path.join(root, "public", "icons"), path.join(root, "dist", "icons")];
const sizes = [16, 32, 48, 128];

if (!fs.existsSync(source)) {
  console.error(`[icons] source not found: ${source}`);
  process.exit(1);
}

for (const outDir of outDirs) fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const png = await sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
  for (const outDir of outDirs) {
    fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  }
  console.log(`[icons] icon${size}.png (${png.length} bytes)`);
}
