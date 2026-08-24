import { describe, it, expect } from "vitest";
import { gx1 } from "@tonesmith/core";
import { runCli } from "./helpers";

/** Runs the command, asserts it succeeded, and hands back its joined stdout. */
const capabilitiesOutput = async (...args: string[]): Promise<string> => {
  const { info, error, exitCode } = await runCli(["gx1", "capabilities", ...args]);

  expect(exitCode, error.join("\n")).toBeUndefined();
  return info.join("\n");
};

describe("gx1 capabilities", () => {
  it("lists every capability group when given no arguments", async () => {
    const output = await capabilitiesOutput();

    for (const group of gx1.driver.capabilities.groups) {
      expect(output).toContain(group.id);
    }
  });

  // Every real group matches case-insensitively, so the chain pointer printed alongside them has
  // to as well, or the one argument the group listing recommends is the one needing exact case.
  it.each(["chain", "CHAIN"])("prints the full default block order for %o", async (argument) => {
    const output = await capabilitiesOutput(argument);

    for (const block of gx1.driver.capabilities.chain.defaultOrder) {
      expect(output).toContain(block);
    }
  });

  // The settings sit in no group, so the chain view is the only page that can print them.
  it("prints the settings the patch itself holds alongside the chain", async () => {
    const output = await capabilitiesOutput("chain");

    for (const setting of gx1.driver.capabilities.patchSettings) {
      expect(output).toContain(setting.name);
    }
  });

  it("lists a group's type ids", async () => {
    const output = await capabilitiesOutput("amp");

    expect(output).toContain("JC-120");
  });

  it("prints a type's subtypes and the hardware it models", async () => {
    const output = await capabilitiesOutput("fx", "compressor");

    expect(output).toContain("MXR Dyna Comp");
  });

  it("prints each sub-algorithm's own param set", async () => {
    const output = await capabilitiesOutput("fx", "delay");

    // MODULATE carries params STANDARD lacks, so these prove the per-subtype set is printed
    // rather than one shared set for the whole type.
    expect(output).toContain("MODULATE");
    expect(output).toContain("MOD RATE");
    expect(output).toContain("MOD DEPTH");
  });

  // Without the key you can't address the param in `write`.
  it("prints each param's write key alongside its display name", async () => {
    const output = await capabilitiesOutput("fx", "chorus");

    expect(output).toContain("PRE-DELAY");
    expect(output).toContain("preDelay");
  });

  // For lookup params `range` is only a summary; the exact labels come from `values`.
  it("enumerates the exact labels for a lookup param", async () => {
    const output = await capabilitiesOutput("delay", "standard");

    expect(output).toContain("HIGH CUT");
    expect(output).toContain("2.5kHz");
    expect(output).toContain("FLAT");
  });

  it("prints the block controls for a group with no selectable types", async () => {
    const output = await capabilitiesOutput("noiseGate");

    expect(output).toContain("THRESHOLD");
    expect(output).toContain("RELEASE");
  });

  // HARMONIST's KEY is the ParamSpec exception: it reads the patch-level key rather than a codec
  // field of its own, so it has no write key to print and must not be dropped from the listing.
  it("prints a param that has no write key", async () => {
    const output = await capabilitiesOutput("fx", "HARMONIST");

    const keyLine = output.split("\n").find(line => line.trim().startsWith("KEY "));
    expect(keyLine).toBeDefined();
  });

  // The chain is one view with nothing under it. Printing it anyway would answer a question the
  // caller did not ask, and every other group rejects a second argument it cannot resolve. Also
  // the command's one error case: which group and type ids resolve is core's lookup, proven there.
  it("exits with an error when the chain is given a second argument", async () => {
    const { error, exitCode } = await runCli(["gx1", "capabilities", "chain", "bogus"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("bogus");
  });
});
