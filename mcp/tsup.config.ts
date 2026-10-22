import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  external: ["@tonesmith/core", "@modelcontextprotocol/server", "zod"],
  clean: true,
  sourcemap: true,
});
