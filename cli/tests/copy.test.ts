import { describe, it, expect, afterEach } from "vitest";
import { runCli, withTempDir, patchAt } from "./helpers";

describe("gx1 copy", () => {
  let src: ReturnType<typeof withTempDir>;
  let dst: ReturnType<typeof withTempDir>;
  afterEach(() => { src.cleanup(); dst.cleanup(); });

  it("copies a patch from src into dst at the given index", async () => {
    src = withTempDir();
    dst = withTempDir();
    const srcName = patchAt(src.fixture).name;

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "0", dst.fixture, "1"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    expect(patchAt(dst.fixture, 1).name).toBe(srcName);
  });

  it("overwrites an existing patch at the destination index", async () => {
    src = withTempDir();
    dst = withTempDir();
    const srcName = patchAt(src.fixture, 2).name;
    const dstOriginalName = patchAt(dst.fixture).name;
    expect(srcName).not.toBe(dstOriginalName);

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "2", dst.fixture, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    expect(patchAt(dst.fixture).name).toBe(srcName);
  });

  it("exits with an error for a bad source ref", async () => {
    src = withTempDir();
    dst = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "No Such Patch", dst.fixture, "0"]);

    expect(exitCode).toBe(1);
    expect(error.length).toBeGreaterThan(0);
  });

  it("exits with an error for a bad destination ref", async () => {
    src = withTempDir();
    dst = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "0", dst.fixture, "No Such Patch"]);

    expect(exitCode).toBe(1);
    expect(error.length).toBeGreaterThan(0);
  });
});
