import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";
import { gx1 } from "@tonesmith/core";
import { printPatch } from "../src/devices/gx1/print";

const capturedOutput = (info: MockInstance<(message?: unknown) => void>): string =>
  info.mock.calls.map(call => String(call[0])).join("\n");

describe("printPatch", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("omits the bracketed index label when index is not given", () => {
    const patch = gx1.basePatch("Solo Patch");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch);

    const output = capturedOutput(info);
    expect(output).toContain("Solo Patch");
    expect(output).not.toMatch(/\[\d+\] Solo Patch/);
  });

  // A bypassed block keeps its settings on the device, so the printer shows them rather than
  // hiding the block — matching every other block, and matching read_patch.
  it("prints the OD/DS line with its params when odds is off", () => {
    const patch = gx1.basePatch("Test");
    gx1.odds(patch, { type: "OVERDRIVE", drive: 50, tone: 0, level: 50, on: false });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("OD/DS [OFF]");
    expect(output).toContain("Drive=50");
  });

  it("prints the memo when a patch carries one", () => {
    const patch = gx1.basePatch("Test");
    patch.memo = "bridge pickup";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    expect(capturedOutput(info)).toContain("Memo: bridge pickup");
  });

  it("shows the solo level when odds solo is enabled", () => {
    const patch = gx1.basePatch("Test");
    gx1.odds(patch, { type: "OVERDRIVE", drive: 50, tone: 0, level: 50, solo: true, soloLevel: 75 });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("Solo=ON(75)");
  });

  it("shows the type's default params for an FX slot the caller didn't configure", () => {
    const patch = gx1.basePatch("Test");
    gx1.fx(patch, { slot: "fx1", type: "TREMOLO" });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("FX1 [ON]  TREMOLO");
    expect(output).toContain("rate=75  depth=50  level=100");
  });

  it("omits the params line for a block whose type has no known fields", () => {
    const patch = gx1.basePatch("Test");
    // A pfx type outside PFX_TYPE_MAPS decodes to a bare { on, type } block —
    // printParams should print nothing beyond the PFX header line for it.
    patch.pfx = { on: true, type: "BOGUS TYPE" } as unknown as gx1.Patch["pfx"];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("PFX [ON]  BOGUS TYPE");
    expect(output).not.toMatch(/PFX.*\n\s+\w+=/);
  });

  it("omits the params line for an FX slot whose type has no known fields", () => {
    const patch = gx1.basePatch("Test");
    gx1.fx(patch, { slot: "fx1", type: "BOGUS EFFECT" });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("FX1 [ON]  BOGUS EFFECT");
    expect(output).not.toMatch(/FX1.*\n\s+\w+=/);
  });
});
