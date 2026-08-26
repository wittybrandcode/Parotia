import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Cast: vitest bundles its own vite whose Plugin type differs from the
  // project's vite — the runtime plugin is still fully applied.
  plugins: [react() as never],
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // Non-targets: barrel re-exports, type-only modules, and mount entries.
      exclude: [
        "src/shared/index.ts",
        "src/shared/types/**",
        "src/ui/src/main.tsx",
        "src/ui/src/editor/main.tsx",
        "src/content/handlers/types.ts",
      ],
      reporter: ["text", "text-summary", "html", "json-summary"],
      thresholds: {
        statements: 92.2,
        branches: 83,
        functions: 85.1,
        lines: 92.2,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.join(dir, "src/shared"),
      "@content": path.join(dir, "src/content"),
      "@background": path.join(dir, "src/background"),
      "@ui": path.join(dir, "src/ui"),
    },
  },
});
