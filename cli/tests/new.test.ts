import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { gx1 } from "@tonesmith/core";
import { runCli, emptyTempDir } from "./helpers";

describe("gx1 new", () => {
  let temp: ReturnType<typeof emptyTempDir>;
  afterEach(() => { temp.cleanup(); });

  it("creates a single blank patch named after the file by default", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "my-tones.tsl");
    const { error, exitCode } = await runCli(["gx1", "new", file]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const created = gx1.driver.readFile(file);
    expect(created.patches).toHaveLength(1);
    expect(created.name).toBe("my-tones");
  });

  it("creates N blank patches when given a count", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "multi.tsl");
    const { error, exitCode } = await runCli(["gx1", "new", file, "My Set", "3"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(gx1.driver.readFile(file).patches).toHaveLength(3);
  });

  it("uses a custom set name when given", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "custom.tsl");
    const { error, exitCode } = await runCli(["gx1", "new", file, "Custom Name"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(gx1.driver.readFile(file).name).toBe("Custom Name");
  });

  it("refuses to overwrite an existing file", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "exists.tsl");
    const first = await runCli(["gx1", "new", file]);
    expect(first.exitCode, first.error.join("\n")).toBeUndefined();

    const { error, exitCode } = await runCli(["gx1", "new", file]);
    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("already exists");
  });
});
