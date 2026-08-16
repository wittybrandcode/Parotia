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
      exclude: ["src/shared/index.ts", "src/shared/types/**", "src/ui/src/main.tsx"],
      reporter: ["text", "text-summary"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@shared": path.join(dir, "src/shared"),
      "@storage": path.join(dir, "src/storage"),
      "@presets": path.join(dir, "src/presets"),
      "@content": path.join(dir, "src/content"),
      "@background": path.join(dir, "src/background"),
      "@ui": path.join(dir, "src/ui"),
    },
  },
});
