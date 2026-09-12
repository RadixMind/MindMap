import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
    exclude: ["node_modules/**", "dist/**", "tests/e2e/**"],
  },
});
