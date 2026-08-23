import fs from "node:fs";
import path from "node:path";

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const allowedLocalStageWriters = new Set([
  "src/background/editorTickets.ts",
  "src/content/handlers/captureHandler.ts",
]);
const failures = [];

for (const file of sourceFiles("src")) {
  const normalized = file.replaceAll("\\", "/");
  const source = fs.readFileSync(file, "utf8");
  if (/postMessage\([\s\S]{0,300},\s*["']\*["']\s*\)/.test(source)) {
    failures.push(`${normalized}: wildcard postMessage target`);
  }
  if (source.includes("chrome.storage.local.set") && !allowedLocalStageWriters.has(normalized)) {
    failures.push(`${normalized}: unreviewed local staging writer`);
  }
}

if (failures.length > 0) throw new Error(`Security invariant check failed:\n${failures.join("\n")}`);
console.log("[security] postMessage and temporary-storage writer invariants passed");
