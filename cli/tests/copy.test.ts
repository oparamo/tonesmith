import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { runCli, withTempDir } from "./helpers";

describe("gx1 copy", () => {
  let src: ReturnType<typeof withTempDir>;
  let dst: ReturnType<typeof withTempDir>;
  afterEach(() => { src.cleanup(); dst.cleanup(); });

  it("copies a patch from src into dst at the given index", async () => {
    src = withTempDir();
    dst = withTempDir();
    const srcName = gx1.driver.readFile(src.fixture).patches[0].name;

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "0", dst.fixture, "1"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(gx1.driver.readFile(dst.fixture).patches[1].name).toBe(srcName);
  });

  it("overwrites an existing patch at the destination index", async () => {
    src = withTempDir();
    dst = withTempDir();
    const srcName = gx1.driver.readFile(src.fixture).patches[2].name;
    const dstOriginalName = gx1.driver.readFile(dst.fixture).patches[0].name;
    expect(srcName).not.toBe(dstOriginalName);

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "2", dst.fixture, "0"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(gx1.driver.readFile(dst.fixture).patches[0].name).toBe(srcName);
  });

  it("exits with an error for a bad source ref", async () => {
    src = withTempDir();
    dst = withTempDir();
    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "No Such Patch", dst.fixture, "0"]);
    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain('No patch named "No Such Patch"');
  });

  it("exits with an error for a bad destination ref", async () => {
    src = withTempDir();
    dst = withTempDir();
    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "0", dst.fixture, "No Such Patch"]);
    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain('No patch named "No Such Patch"');
  });
});
