import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true, alias: { "server-only": new URL("./tests/unit/stubs/server-only.ts", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
