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
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 97.35,
        statements: 99.81,
      },
    },
  },
});
