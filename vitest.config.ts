import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    /**
     * 15s, not vitest's 5s.
     *
     * A handful of suites import the real module graph behind a server action —
     * the permission catalogue, db/schema, the status libraries — and that
     * import is charged to whichever test triggers it first. Those modules grew
     * with the Billing and Archive work, and two device sign-in cases started
     * timing out at 5.0s and 5.6s: slow to LOAD, not slow to run, and nothing to
     * do with the behaviour being asserted. CI machines are slower again.
     */
    testTimeout: 15_000,
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
