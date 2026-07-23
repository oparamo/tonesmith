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

  it("skips the OD/DS line entirely when odds is off", () => {
    const patch = gx1.basePatch("Test");
    gx1.clearOdds(patch);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).not.toContain("Drive=");
  });

  it("shows the solo level when odds solo is enabled", () => {
    const patch = gx1.basePatch("Test");
    gx1.odds(patch, "OVERDRIVE", 50, 0, 50, 0, true, 75);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("Solo=ON(75)");
  });

  it("shows the type's default params for an FX slot the caller didn't configure", () => {
    const patch = gx1.basePatch("Test");
    gx1.fx(patch, "fx1", "TREMOLO");
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
    gx1.fx(patch, "fx1", "BOGUS EFFECT");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("FX1 [ON]  BOGUS EFFECT");
    expect(output).not.toMatch(/FX1.*\n\s+\w+=/);
  });
});
