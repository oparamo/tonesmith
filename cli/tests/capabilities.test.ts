import { describe, it, expect } from "vitest";
import { runCli } from "./helpers";

describe("gx1 capabilities", () => {
  it("lists all groups plus a chain pointer when given no arguments", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Capability groups");
    expect(output).toContain("amp");
    expect(output).toContain("fx");
    expect(output).toContain("Signal Chain");
    expect(output).toContain("capabilities chain");
  });

  it("prints the signal-chain model for the chain argument", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "chain"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Signal chain");
    expect(output).toContain("Default order:");
    expect(output).toContain("FV");
  });

  it("lists all items in a single group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "amp"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("JC-120");
  });

  it("prints full detail for a single item", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "amp", "jc-120"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("[amp / JC-120]");
  });

  it("lists an item's subtypes when browsing a group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "fx"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Subtypes:");
  });

  it("prints full detail for an item with subtypes and modeled hardware", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "fx", "compressor"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Subtypes:");
    expect(output).toContain("[models: MXR Dyna Comp]");
    expect(output).toContain("Parameters:");
  });

  it("prints per-subtype params for the FX-slot DELAY sub-algorithms", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "fx", "delay"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Subtypes:");
    expect(output).toContain("MODULATE");
    // MODULATE carries params STANDARD lacks — proof each sub-algorithm's own set is printed
    expect(output).toContain("MOD RATE");
    expect(output).toContain("MOD DEPTH");
  });

  // Without the key you can't address the param in `write`, and for lookup params `range` is only
  // a summary — the exact labels come from `values`.
  it("prints each param's write key", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "fx", "chorus"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("PRE-DELAY");
    expect(output).toContain("preDelay");
  });

  it("enumerates the exact labels for a lookup param", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "delay", "standard"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("HIGH CUT");
    expect(output).toContain("Values:");
    expect(output).toContain("2.5kHz");
    expect(output).toContain("FLAT");
  });

  it("omits the Parameters section for an item with no params of its own or from its group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "cab", "original"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("[cab / ORIGINAL]");
    expect(output).not.toContain("Parameters:");
  });

  it("prints block controls and a 'no selectable types' message for a params-only group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "ns"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Block controls:");
    expect(output).toContain("no selectable types for this block");
  });

  it("exits with an error listing available groups for an unknown group", async () => {
    const { error, exitCode } = await runCli(["gx1", "capabilities", "nonexistent"]);

    expect(exitCode).toBe(1);
    const message = error.join("\n");
    expect(message).toContain('Unknown group "nonexistent"');
    expect(message).toContain("amp");
  });

  it("exits with an error listing available items for an unknown item", async () => {
    const { error, exitCode } = await runCli(["gx1", "capabilities", "amp", "nonexistent"]);

    expect(exitCode).toBe(1);
    const message = error.join("\n");
    expect(message).toContain('Unknown item "nonexistent"');
    expect(message).toContain("JC-120");
  });
});
