import { describe, it, expect } from "vitest";
import { gx1 } from "@tonesmith/core";
import { runCli, FIXTURE } from "./helpers";

const expected = gx1.driver.readFile(FIXTURE);

describe("gx1 read", () => {
  it("prints every patch when ref is omitted", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
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

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain(expected.patches[0].name);
    expect(output).not.toContain(expected.patches[1].name);
  });

  it("exits with an error for a patch name that doesn't exist", async () => {
    const { error, exitCode } = await runCli(["gx1", "read", FIXTURE, "No Such Patch"]);

    expect(exitCode).toBe(1);
    expect(error.length).toBeGreaterThan(0);
  });

  it("exits with an error for a missing file", async () => {
    const { error, exitCode } = await runCli(["gx1", "read", "/no/such/file.tsl"]);

    expect(exitCode).toBe(1);
    expect(error.length).toBeGreaterThan(0);
  });

  it("prints the chain as a comma-separated list, not arrows", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    const expectedChain = expected.patches[0].chain.join(", ");
    expect(output).toContain(`Chain: ${expectedChain}`);
    expect(output).not.toContain("→");
  });

  it("hides the redundant params.type mirror — the model shows once, as the subType label", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    const patch = expected.patches[0];
    const mirror = [patch.fx1, patch.fx2, patch.fx3].find(
      block => block.subType !== null && block.params.type === block.subType,
    );
    expect(mirror, "fixture patch 0 has no subtype fx block to prove the mirror is hidden").toBeDefined();
    expect(output).toContain(`(${mirror?.subType})`);
    expect(output).not.toContain("type=");
  });

  it("prints lookup-shaped fields (delay highCut) as their label, not a raw index", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    const expectedHighCut = String(expected.patches[0].delay.highCut);
    expect(output).toContain(`highCut=${expectedHighCut}`);
  });
});
