import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // The extension must be built first: `npm run test:e2e` triggers
  // `pretest:e2e`, which runs the full build into dist/.
});
