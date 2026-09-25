import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { gx1, patchService } from "@tonesmith/core";
import { runCli, emptyTempDir } from "./helpers";

describe("gx1 new", () => {
  let temp: Awaited<ReturnType<typeof emptyTempDir>>;
  afterEach(async () => { await temp.cleanup(); });

  it("creates a single blank patch named after the file by default", async () => {
    temp = await emptyTempDir();
    const file = join(temp.dir, "my-tones.tsl");

    const { error, exitCode } = await runCli(["gx1", "new", file]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const created = await patchService.readPatchFile(gx1.driver, file);
    expect(created.patches).toHaveLength(1);
    expect(created.name).toBe("my-tones");
  });

  // Each option stands alone, so asking for a count doesn't also require naming the set.
  it("creates N blank patches when given a count, with no set name", async () => {
    temp = await emptyTempDir();
    const file = join(temp.dir, "multi.tsl");

    const { error, exitCode } = await runCli(["gx1", "new", file, "--count", "3"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const created = await patchService.readPatchFile(gx1.driver, file);
    expect(created.patches).toHaveLength(3);
    expect(created.name).toBe("multi");
  });

  it("uses a custom set name when given", async () => {
    temp = await emptyTempDir();
    const file = join(temp.dir, "custom.tsl");

    const { error, exitCode } = await runCli(["gx1", "new", file, "--set-name", "Custom Name"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const created = await patchService.readPatchFile(gx1.driver, file);
    expect(created.name).toBe("Custom Name");
  });

  it("rejects a count that is not a whole number of patches", async () => {
    temp = await emptyTempDir();
    const file = join(temp.dir, "bad-count.tsl");

    const { exitCode } = await runCli(["gx1", "new", file, "--count", "lots"]);

    expect(exitCode).toBe(1);
  });

  // The command's one error case: a driver throw becomes a printed message and a failing exit
  // code. That an existing file is refused at all is core's, and is proven there.
  it("prints a driver rejection and exits 1", async () => {
    temp = await emptyTempDir();
    const file = join(temp.dir, "exists.tsl");
    const first = await runCli(["gx1", "new", file]);
    const firstErrorOutput = first.error.join("\n");
    expect(first.exitCode, firstErrorOutput).toBeUndefined();

    const { error, exitCode } = await runCli(["gx1", "new", file]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain(file);
  });
});
