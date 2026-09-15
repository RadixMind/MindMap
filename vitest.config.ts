import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Site islands import public entries; unit tests must not need a prior build.
    alias: Object.entries({
      core: "core.ts",
      static: "static.ts",
      viewer: "viewer.ts",
      editor: "editor.ts",
      extensions: "extensions/index.ts",
      "features/history": "features/history.ts",
      "features/search": "features/search.ts",
      "features/import": "features/import.ts",
      "features/export": "features/export.ts",
    }).map(([entry, file]) => ({
      find: new RegExp(`^@xiangfa/mindmap/${entry}$`),
      replacement: fileURLToPath(new URL(`./src/components/MindMap/entries/${file}`, import.meta.url)),
    })),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
    exclude: ["node_modules/**", "dist/**", "tests/e2e/**"],
  },
});
