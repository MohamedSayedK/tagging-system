import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration suites create and drop several OpenSearch indices; run side by side on a small node that
    // can take longer than vitest's 5 s default without anything being wrong.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    setupFiles: ["web/src/test/setup.ts"],
  },
});
