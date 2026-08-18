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

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const created = gx1.driver.readFile(file);
    expect(created.patches).toHaveLength(1);
    expect(created.name).toBe("my-tones");
  });

  // Each option stands alone, so asking for a count doesn't also require naming the set.
  it("creates N blank patches when given a count, with no set name", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "multi.tsl");

    const { error, exitCode } = await runCli(["gx1", "new", file, "--count", "3"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const created = gx1.driver.readFile(file);
    expect(created.patches).toHaveLength(3);
    expect(created.name).toBe("multi");
  });

  it("uses a custom set name when given", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "custom.tsl");

    const { error, exitCode } = await runCli(["gx1", "new", file, "--set-name", "Custom Name"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const created = gx1.driver.readFile(file);
    expect(created.name).toBe("Custom Name");
  });

  it("rejects a count that is not a whole number of patches", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "bad-count.tsl");

    const { exitCode } = await runCli(["gx1", "new", file, "--count", "lots"]);

    expect(exitCode).toBe(1);
  });

  it("refuses to overwrite an existing file", async () => {
    temp = emptyTempDir();
    const file = join(temp.dir, "exists.tsl");
    const first = await runCli(["gx1", "new", file]);
    const firstErrorOutput = first.error.join("\n");
    expect(first.exitCode, firstErrorOutput).toBeUndefined();

    const { error, exitCode } = await runCli(["gx1", "new", file]);

    expect(exitCode).toBe(1);
    expect(error.length).toBeGreaterThan(0);
  });
});
