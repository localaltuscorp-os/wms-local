import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    /**
     * 30s, not vitest's 5s.
     *
     * A handful of suites import the real module graph behind a server action —
     * the permission catalogue, db/schema, the status libraries — and that
     * import is charged to whichever test triggers it first. Those modules grow
     * with every module the firm adds: the Billing and Archive work pushed two
     * device sign-in cases past 5s, the executive calendar and Client
     * Engagement pushed the same case past 15s. It is slow to LOAD, not slow to
     * run, and nothing to do with the behaviour being asserted. CI machines are
     * slower again.
     *
     * If this needs raising a third time, the fix is not a bigger number: it is
     * to stop those suites importing the whole graph to test one function.
     */
    testTimeout: 30_000,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
    coverage: {
      include: ["lib/transforms/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
