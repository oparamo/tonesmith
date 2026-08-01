import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**"],
      exclude: [
        "src/**/types/**",
        "src/**/types.ts",
        "src/**/index.ts",
        "src/**/raw.ts",
      ],
      // Floors that catch a real collapse in coverage, deliberately well below the measured
      // numbers. Gating at 100 is what pushed earlier suites into asserting on help-text wording
      // to reach the last uncovered branch; a test has to justify itself by describing behavior.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
