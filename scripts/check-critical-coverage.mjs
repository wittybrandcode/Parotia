import fs from "node:fs";
import path from "node:path";

const summaryPath = path.resolve("coverage/coverage-summary.json");
if (!fs.existsSync(summaryPath)) {
  throw new Error("coverage-summary.json is missing; run Vitest with json-summary first");
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const rules = [
  { suffix: "src/content/handlers/captureHandler.ts", lines: 85, functions: 85, branches: 75 },
  { suffix: "src/ui/src/editor/AnnotationLayer.ts", lines: 85, functions: 85, branches: 75 },
  { suffix: "src/content/editor/editorModal.ts", lines: 85, functions: 85, branches: 75 },
  { suffix: "src/background/sessionRegistry.ts", lines: 85, functions: 85, branches: 75 },
  { suffix: "src/background/editorTickets.ts", lines: 90, functions: 90, branches: 80 },
  { suffix: "src/background/captureCoordinator.ts", lines: 90, functions: 90, branches: 80 },
];

const normalizedEntries = Object.entries(summary).map(([file, metrics]) => [
  file.replaceAll("\\", "/"),
  metrics,
]);
const failures = [];

for (const rule of rules) {
  const entry = normalizedEntries.find(([file]) => file.endsWith(rule.suffix));
  if (!entry) {
    failures.push(`${rule.suffix}: no coverage entry`);
    continue;
  }
  const [, metrics] = entry;
  for (const metric of ["lines", "functions", "branches"]) {
    const actual = metrics[metric]?.pct;
    const required = rule[metric];
    if (typeof actual !== "number" || actual < required) {
      failures.push(`${rule.suffix} ${metric}: ${actual ?? "missing"}% < ${required}%`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Critical coverage gate failed:\n${failures.join("\n")}`);
}

console.log(`[coverage] ${rules.length} critical-file gates passed`);
