import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** UI app — toolbar (index) + options page. Builds into dist/ui. */
export default defineConfig({
  root: path.join(dir, "src/ui"),
  plugins: [react()],
  base: "./",
  publicDir: false,
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
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
    target: "chrome120",
    rollupOptions: {
      input: {
        index: path.join(dir, "src/ui/index.html"),
        options: path.join(dir, "src/ui/options.html"),
      },
    },
  },
});
