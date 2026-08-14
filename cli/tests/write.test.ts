import { describe, it, expect, afterEach } from "vitest";
import { runCli, withTempDir, patchAt } from "./helpers";

describe("gx1 write", () => {
  let temp: ReturnType<typeof withTempDir>;
  afterEach(() => { temp.cleanup(); });

  it("writes a single numeric field, coercing it from its string form", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain=99"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const patch = patchAt(temp.fixture);
    expect(patch.amp.gain).toBe(99);
  });

  it("writes multiple fields in one call", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain=10", "amp.level=20"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const patch = patchAt(temp.fixture);
    expect(patch.amp.gain).toBe(10);
    expect(patch.amp.level).toBe(20);
  });

  it("coerces boolean field writes", async () => {
    temp = withTempDir();

    const written = await runCli(["gx1", "write", temp.fixture, "0", "amp.solo=true"]);

    const writeErrorOutput = written.error.join("\n");
    expect(written.exitCode, writeErrorOutput).toBeUndefined();
    const patch = patchAt(temp.fixture);
    expect(patch.amp.solo).toBe(true);
  });

  it("writes multiple block states in one call", async () => {
    temp = withTempDir();

    const written = await runCli(["gx1", "write", temp.fixture, "0",
      "amp.on=false", "delay.on=true", "reverb.on=false", "pfx.on=true", "ns.on=false",
    ]);

    const writeErrorOutput = written.error.join("\n");
    expect(written.exitCode, writeErrorOutput).toBeUndefined();

    const patch = patchAt(temp.fixture);
    expect(patch.amp.on).toBe(false);
    expect(patch.delay.on).toBe(true);
    expect(patch.reverb.on).toBe(false);
    expect(patch.pfx.on).toBe(true);
    expect(patch.ns.on).toBe(false);
  });

  it("writes a top-level scalar field", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "key=G"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const patch = patchAt(temp.fixture);
    expect(patch.key).toBe("G");
  });

  it("exits with an error for an unresolvable ref", async () => {
    temp = withTempDir();

    const { exitCode } = await runCli(["gx1", "write", temp.fixture, "Nonexistent", "key=G"]);

    expect(exitCode).toBe(1);
  });

  it("rejects a field argument with no '=', naming it as typed", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("amp.gain");
  });

  it("exits with an error for a bad dot-path", async () => {
    temp = withTempDir();

    const { exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "nonexistent.foo=1"]);

    expect(exitCode).toBe(1);
  });

  it("writes a lookup field by label", async () => {
    temp = withTempDir();

    const written = await runCli(["gx1", "write", temp.fixture, "0", "delay.highCut=2.5kHz"]);

    const writeErrorOutput = written.error.join("\n");
    expect(written.exitCode, writeErrorOutput).toBeUndefined();
    const patch = patchAt(temp.fixture);
    expect(patch.delay.highCut).toBe("2.5kHz");
  });

  it("exits with an error for a label not in the field's table", async () => {
    temp = withTempDir();

    const { exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "delay.highCut=2.6kHz"]);

    expect(exitCode).toBe(1);
  });
});
