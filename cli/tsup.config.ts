import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  external: ["@tonesmith/core", "commander"],
  clean: true,
  sourcemap: true,
});
