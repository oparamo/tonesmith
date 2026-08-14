import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { runCli, withTempDir } from "./helpers";

describe("gx1 write", () => {
  let temp: ReturnType<typeof withTempDir>;
  afterEach(() => { temp.cleanup(); });

  it("writes a single numeric field, coercing it from its string form", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain=99"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].amp.gain).toBe(99);
  });

  it("writes multiple fields in one call", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain=10", "amp.level=20"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const file = gx1.driver.readFile(temp.fixture);
    const patch = file.patches[0];
    expect(patch.amp.gain).toBe(10);
    expect(patch.amp.level).toBe(20);
  });

  it("coerces boolean field writes", async () => {
    temp = withTempDir();

    const written = await runCli(["gx1", "write", temp.fixture, "0", "amp.solo=true"]);

    const writeErrorOutput = written.error.join("\n");
    expect(written.exitCode, writeErrorOutput).toBeUndefined();
    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].amp.solo).toBe(true);
  });

  it("writes multiple block states in one call", async () => {
    temp = withTempDir();

    const written = await runCli(["gx1", "write", temp.fixture, "0",
      "amp.on=false", "delay.on=true", "reverb.on=false", "pfx.on=true", "ns.on=false",
    ]);

    const writeErrorOutput = written.error.join("\n");
    expect(written.exitCode, writeErrorOutput).toBeUndefined();

    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].amp.on).toBe(false);
    expect(file.patches[0].delay.on).toBe(true);
    expect(file.patches[0].reverb.on).toBe(false);
    expect(file.patches[0].pfx.on).toBe(true);
    expect(file.patches[0].ns.on).toBe(false);
  });

  it("writes a top-level scalar field", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "key=G"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].key).toBe("G");
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
    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].delay.highCut).toBe("2.5kHz");
  });

  it("exits with an error for a label not in the field's table", async () => {
    temp = withTempDir();

    const { exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "delay.highCut=2.6kHz"]);

    expect(exitCode).toBe(1);
  });
});
