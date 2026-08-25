import { describe, it, expect } from "vitest";
import { gx1 } from "@tonesmith/core";
import { runCli, present, FIXTURE } from "./helpers";

const expected = gx1.driver.readFile(FIXTURE);
const firstPatch = present(expected.patches[0], "fixture patch 0");
const secondPatch = present(expected.patches[1], "fixture patch 1");

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
    expect(output).toContain(`Device: ${gx1.driver.name}`);
  });

  it("prints a single patch when given a numeric index", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain(firstPatch.name);
    expect(output).not.toContain(secondPatch.name);
  });

  // The command's one error case: a driver throw becomes a printed message and a failing exit
  // code. Which refs and files the driver refuses is core's, and is proven there.
  it("prints a driver rejection and exits 1", async () => {
    const { error, exitCode } = await runCli(["gx1", "read", FIXTURE, "No Such Patch"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("No Such Patch");
  });

  it("prints the chain as a comma-separated list, not arrows", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    const expectedChain = firstPatch.chain.join(", ");
    expect(output).toContain(`Chain: ${expectedChain}`);
    expect(output).not.toContain("→");
  });

  it("prints an fx slot's sub-model as its label rather than among its params", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    const selected = [firstPatch.fx1, firstPatch.fx2, firstPatch.fx3].find(block => block.subType !== null);
    expect(selected, "fixture patch 0 has no fx block with a sub-model to print").toBeDefined();
    expect(output).toContain(`(${selected?.subType})`);
    expect(output).not.toContain("subType=");
  });

  it("prints lookup-shaped fields (delay highCut) as their label, not a raw index", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    const expectedHighCut = String(firstPatch.delay.params.highCut);
    expect(output).toContain(`highCut=${expectedHighCut}`);
  });
});
