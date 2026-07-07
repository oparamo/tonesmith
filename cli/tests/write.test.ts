import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { runCli, withTempDir } from "./helpers";

describe("gx1 write", () => {
  let temp: ReturnType<typeof withTempDir>;
  afterEach(() => { temp.cleanup(); });

  it("writes a single numeric field", async () => {
    temp = withTempDir();
    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain=99"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(gx1.driver.readFile(temp.fixture).patches[0].amp.gain).toBe(99);
  });

  it("writes multiple fields in one call", async () => {
    temp = withTempDir();
    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain=10", "amp.level=20"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const patch = gx1.driver.readFile(temp.fixture).patches[0];
    expect(patch.amp.gain).toBe(10);
    expect(patch.amp.level).toBe(20);
  });

  it("coerces boolean field writes and shows the change on re-read", async () => {
    temp = withTempDir();
    const written = await runCli(["gx1", "write", temp.fixture, "0", "amp.solo=true"]);
    expect(written.exitCode, written.error.join("\n")).toBeUndefined();
    expect(gx1.driver.readFile(temp.fixture).patches[0].amp.solo).toBe(true);

    const { info } = await runCli(["gx1", "read", temp.fixture, "0"]);
    expect(info.join("\n")).toContain("Solo=ON(");
  });

  it("coerces numeric field writes and shows the change on re-read", async () => {
    temp = withTempDir();
    const written = await runCli(["gx1", "write", temp.fixture, "0", "amp.gain=77"]);
    expect(written.exitCode, written.error.join("\n")).toBeUndefined();
    const { info } = await runCli(["gx1", "read", temp.fixture, "0"]);
    expect(info.join("\n")).toContain("Gain=77");
  });

  it("shows every block's off/on state after toggling it opposite of the fixture default", async () => {
    temp = withTempDir();
    const written = await runCli(["gx1", "write", temp.fixture, "0",
      "amp.on=false", "delay.on=true", "reverb.on=false", "pfx.on=true", "ns.on=false",
    ]);
    expect(written.exitCode, written.error.join("\n")).toBeUndefined();

    const { info, error, exitCode } = await runCli(["gx1", "read", temp.fixture, "0"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("AMP/CAB [OFF]");
    expect(output).toContain("DELAY [ON]");
    expect(output).toContain("REVERB [OFF]");
    expect(output).toContain("PFX [ON]");
    expect(output).toContain("NS [OFF]");
  });

  it("writes a top-level scalar field", async () => {
    temp = withTempDir();
    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "key=G"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(gx1.driver.readFile(temp.fixture).patches[0].key).toBe("G");
  });

  it("exits with an error for an unresolvable ref", async () => {
    temp = withTempDir();
    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "Nonexistent", "key=G"]);
    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain('No patch named "Nonexistent"');
  });

  it("exits with an error for a bad dot-path", async () => {
    temp = withTempDir();
    const { exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "nonexistent.foo=1"]);
    expect(exitCode).toBe(1);
  });
});
