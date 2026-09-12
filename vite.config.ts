import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = resolve(root, "src/components/MindMap");

const entry = {
  index: resolve(sourceRoot, "index.ts"),
  core: resolve(sourceRoot, "entries/core.ts"),
  static: resolve(sourceRoot, "entries/static.ts"),
  viewer: resolve(sourceRoot, "entries/viewer.ts"),
  editor: resolve(sourceRoot, "entries/editor.ts"),
  "features/history": resolve(sourceRoot, "entries/features/history.ts"),
  "features/search": resolve(sourceRoot, "entries/features/search.ts"),
  "features/import": resolve(sourceRoot, "entries/features/import.ts"),
  "features/export": resolve(sourceRoot, "entries/features/export.ts"),
  "features/markdown-editor": resolve(sourceRoot, "entries/features/markdown-editor.ts"),
  "features/ai": resolve(sourceRoot, "entries/features/ai.ts"),
  "extensions/index": resolve(sourceRoot, "entries/extensions/index.ts"),
  "extensions/cross-link": resolve(sourceRoot, "entries/extensions/cross-link.ts"),
  "extensions/tags": resolve(sourceRoot, "entries/extensions/tags.ts"),
  "extensions/folding": resolve(sourceRoot, "entries/extensions/folding.ts"),
  "extensions/frontmatter": resolve(sourceRoot, "entries/extensions/frontmatter.ts"),
  "extensions/latex": resolve(sourceRoot, "entries/extensions/latex.ts"),
  "extensions/multiline": resolve(sourceRoot, "entries/extensions/multiline.ts"),
  "extensions/dotted-line": resolve(sourceRoot, "entries/extensions/dotted-line.ts"),
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  ...(mode === "lib"
    ? {
        publicDir: false,
        build: {
          lib: { entry },
          cssCodeSplit: true,
          sourcemap: true,
          emptyOutDir: true,
          rollupOptions: {
            external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "katex"],
            output: [
              {
                format: "es" as const,
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
              },
              {
                format: "cjs" as const,
                entryFileNames: "[name].cjs",
                chunkFileNames: "chunks/[name]-[hash].cjs",
                assetFileNames: "assets/[name]-[hash][extname]",
                exports: "named" as const,
              },
            ],
          },
        },
      }
    : {}),
}));
