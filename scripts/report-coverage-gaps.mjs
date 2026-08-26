import fs from "node:fs";
import path from "node:path";

const summaryPath = path.resolve("coverage/coverage-summary.json");
if (!fs.existsSync(summaryPath)) {
  throw new Error("coverage-summary.json is missing; run npm run test:coverage first");
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const metricNames = ["lines", "statements", "functions", "branches"];

function missing(metric) {
  return Number(metric?.total ?? 0) - Number(metric?.covered ?? 0);
}

function relativeFile(file) {
  const relative = path.relative(process.cwd(), file);
  return (relative.startsWith("..") ? file : relative).replaceAll("\\", "/");
}

const rows = Object.entries(summary)
  .filter(([file]) => file !== "total")
  .map(([file, metrics]) => ({
    file: relativeFile(file),
    lines: missing(metrics.lines),
    statements: missing(metrics.statements),
    functions: missing(metrics.functions),
    branches: missing(metrics.branches),
  }))
  .filter((row) => metricNames.some((metric) => row[metric] > 0))
  .sort((left, right) => right.lines - left.lines || right.branches - left.branches || left.file.localeCompare(right.file));

const total = summary.total;
const totals = Object.fromEntries(metricNames.map((metric) => [metric, missing(total[metric])]));
const requestedLimit = Number.parseInt(process.argv.find((argument) => argument.startsWith("--limit="))?.slice(8) ?? "20", 10);
const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 20;

console.log("\n[coverage gaps] Remaining executable coverage debt");
console.log(`lines=${totals.lines} statements=${totals.statements} functions=${totals.functions} branches=${totals.branches}`);
console.table(rows.slice(0, limit));
if (rows.length > limit) console.log(`[coverage gaps] ${rows.length - limit} additional files omitted; use --limit=${rows.length} to show all`);

