import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";
import type { BlockView, PatchView } from "@tonesmith/core";
import { printPatch } from "../src/common/patch-print";

const capturedOutput = (info: MockInstance<(message?: unknown) => void>): string =>
  info.mock.calls.map(call => String(call[0])).join("\n");

const block = (overrides: Partial<BlockView> = {}): BlockView =>
  ({ label: "AMP", key: "amp", on: true, type: "JC-120", params: { gain: 72 }, ...overrides });

const view = (overrides: Partial<PatchView> = {}): PatchView =>
  ({ name: "Test", details: [], blocks: [block()], ...overrides });

/** What the renderer prints for one view, with color off: these tests run outside a terminal. */
const printed = (patch: PatchView, index = 0): string => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  printPatch(patch, index);
  return capturedOutput(info);
};

describe("printPatch", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("heads the patch with its index and name", () => {
    const output = printed(view({ name: "SWORD LEAD" }), 3);

    expect(output).toContain("[3] SWORD LEAD");
  });

  it("prints each detail the driver supplied, in the order it supplied them", () => {
    const details = [{ label: "Chain", value: "amp, delay" }, { label: "Key", value: "E" }];

    const output = printed(view({ details }));

    expect(output).toContain("Chain: amp, delay");
    expect(output.indexOf("Chain:")).toBeLessThan(output.indexOf("Key:"));
  });

  // The key is what a `write` dot-path and a patch spec take, and no abbreviated panel label
  // gives it away.
  it("prints a block under its panel label and its key", () => {
    const output = printed(view({ blocks: [block({ label: "OD/DS", key: "drive" })] }));

    expect(output).toContain("OD/DS [drive]");
  });

  // A bypassed block keeps its settings on the device, so the renderer shows them rather than
  // hiding the block, matching every other block and matching read_patch.
  it("shows a bypassed block's controls under an OFF tag", () => {
    const drive = block({ label: "OD/DS", key: "drive", on: false, params: { drive: 50 } });

    const output = printed(view({ blocks: [drive] }));

    expect(output).toContain("[OFF]");
    expect(output).toContain("drive=50");
  });

  it("tags no bypass state on a block the device always runs", () => {
    const volume = block({ label: "FV", key: "volume", on: undefined, type: undefined });

    const output = printed(view({ blocks: [volume] }));

    expect(output).not.toContain("[ON]");
    expect(output).not.toContain("[OFF]");
  });

  it("prints the selected model in parentheses after the type", () => {
    const fx1 = block({ label: "FX1", key: "fx1", type: "COMPRESSOR", subType: "BOSS COMP" });

    const output = printed(view({ blocks: [fx1] }));

    expect(output).toContain("COMPRESSOR (BOSS COMP)");
    expect(output).not.toContain("subType=");
  });

  it("omits the params line for a block that carries no controls", () => {
    const empty = block({ label: "FX1", key: "fx1", type: "BOGUS EFFECT", params: {} });

    const output = printed(view({ blocks: [empty] }));

    expect(output).toContain("FX1 [fx1]");
    expect(output).not.toMatch(/FX1.*\n\s+\w+=/);
  });
});
