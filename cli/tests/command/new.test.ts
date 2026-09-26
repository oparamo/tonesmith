import { describe, it, expect, onTestFinished } from "vitest";
import { join } from "node:path";
import { patchService } from "@tonesmith/core";
import { addNew } from "../../src/command/new";
import { fakeDriver, withTempDir, writePatchFile, pathExists, runCommand } from "../helpers";

describe("addNew", () => {
  it("creates a single blank patch named after the file by default", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "my-tones.json");

    const { error, exitCode } = await runCommand(addNew, driver, ["new", file]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const created = await patchService.readPatchFile(driver, file);
    expect(created.patches).toHaveLength(1);
    expect(created.name).toBe("my-tones");
  });

  // Each option stands alone, so asking for a count doesn't also require naming the set.
  it("--count sets how many blank patches the file opens with", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "multi.json");

    const { error, exitCode } = await runCommand(addNew, driver, ["new", file, "--count", "3"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const created = await patchService.readPatchFile(driver, file);
    expect(created.patches).toHaveLength(3);
  });

  it("uses a custom set name when given", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "custom.json");

    const { error, exitCode } = await runCommand(addNew, driver, ["new", file, "--set-name", "Custom Name"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const created = await patchService.readPatchFile(driver, file);
    expect(created.name).toBe("Custom Name");
  });

  it("--set-name and --count together", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "both.json");

    const { error, exitCode } = await runCommand(addNew, driver, [
      "new", file, "--set-name", "Both", "--count", "2",
    ]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const created = await patchService.readPatchFile(driver, file);
    expect(created.name).toBe("Both");
    expect(created.patches).toHaveLength(2);
  });

  it("--count trims surrounding whitespace before parsing", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "trimmed.json");

    const { error, exitCode } = await runCommand(addNew, driver, ["new", file, "--count", " 3 "]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const created = await patchService.readPatchFile(driver, file);
    expect(created.patches).toHaveLength(3);
  });

  it("the success report states the patch count and the set name", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "reported.json");

    const { info } = await runCommand(addNew, driver, ["new", file, "--count", "2"]);

    const output = info.join("\n");
    expect(output).toContain("2");
    expect(output).toContain("reported");
  });

  it.each(["lots", "3.5", "-1", "", "1e2"])("--count %o exits 1 and writes no file", async (count) => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "bad-count.json");

    const { error, exitCode } = await runCommand(addNew, driver, ["new", file, "--count", count]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain(count);
    expect(await pathExists(file)).toBe(false);
  });

  // 0 is a whole number, so it passes parseCount; core's own floor on a usable patch count refuses it.
  it("--count 0 exits 1 and writes no file", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "zero-count.json");

    const { exitCode } = await runCommand(addNew, driver, ["new", file, "--count", "0"]);

    expect(exitCode).toBe(1);
    expect(await pathExists(file)).toBe(false);
  });

  // The command's one error case: a throw becomes a printed message and a failing exit code. That
  // an existing file is refused at all is core's, and is proven there.
  it("a failed create prints the error and exits 1", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const file = await writePatchFile({ dir: temp.dir, filename: "exists.json", patches: [] });

    const { error, exitCode } = await runCommand(addNew, driver, ["new", file]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain(file);
  });
});
