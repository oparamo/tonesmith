import { describe, it, expect } from "vitest";
import { gx1 } from "@tonesmith/core";
import { runCli, FIXTURE } from "./helpers";

const expected = gx1.driver.readFile(FIXTURE);

describe("gx1 read", () => {
  it("prints every patch when ref is omitted", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    for (const patch of expected.patches) {
      expect(output).toContain(patch.name);
    }
  });

  it("prints the file/set/device header", async () => {
    const { info } = await runCli(["gx1", "read", FIXTURE]);
    const output = info.join("\n");
    expect(output).toContain(`Set: ${expected.name}`);
    expect(output).toContain("Device: GX-1");
  });

  it("prints a single patch when given a numeric index", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain(expected.patches[0].name);
    expect(output).not.toContain(expected.patches[1].name);
  });

  it("exits with an error for a patch name that doesn't exist", async () => {
    const { error, exitCode } = await runCli(["gx1", "read", FIXTURE, "No Such Patch"]);
    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain('No patch named "No Such Patch"');
  });

  it("exits with an error for a missing file", async () => {
    const { error, exitCode } = await runCli(["gx1", "read", "/no/such/file.tsl"]);
    expect(exitCode).toBe(1);
    expect(error.length).toBeGreaterThan(0);
  });

  it("prints the chain as a comma-separated list, not arrows", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain(`Chain: ${expected.patches[0].chain.join(", ")}`);
    expect(output).not.toContain("→");
  });

  it("prints lookup-shaped fields (delay highCut) as their label, not a raw index", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain(`highCut=${String(expected.patches[0].delay.highCut)}`);
  });
});
