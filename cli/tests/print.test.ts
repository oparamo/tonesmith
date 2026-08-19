import { describe, it, expect, vi, afterEach, type MockInstance } from "vitest";
import { gx1 } from "@tonesmith/core";
import { printPatch } from "../src/devices/gx1/print";

const capturedOutput = (info: MockInstance<(message?: unknown) => void>): string =>
  info.mock.calls.map(call => String(call[0])).join("\n");

describe("printPatch", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // A bypassed block keeps its settings on the device, so the printer shows them rather than
  // hiding the block, matching every other block and matching read_patch.
  it("prints the OD/DS line with its params when the drive block is off", () => {
    const patch = gx1.driver.buildPatch({
      name: "Test",
      amp: { type: "JC-120" },
      drive: { type: "OVERDRIVE", on: false, params: { drive: 50, tone: 0, level: 50 } },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("OD/DS [OFF]");
    expect(output).toContain("Drive=50");
  });

  it("prints the memo when a patch carries one", () => {
    const patch = gx1.driver.blankPatch("Test");
    patch.memo = "bridge pickup";
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    expect(capturedOutput(info)).toContain("Memo: bridge pickup");
  });

  it("shows the solo level when the drive block's solo is enabled", () => {
    const patch = gx1.driver.buildPatch({
      name: "Test",
      amp: { type: "JC-120" },
      drive: { type: "OVERDRIVE", params: { drive: 50, tone: 0, level: 50, solo: true, soloLevel: 75 } },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("Solo=ON(75)");
  });

  it("shows the type's default params for an FX slot the caller didn't configure", () => {
    const patch = gx1.driver.buildPatch({
      name: "Test",
      amp: { type: "JC-120" },
      fx1: { type: "TREMOLO" },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("FX1 [ON]  TREMOLO");
    expect(output).toContain("rate=75  depth=50  level=100");
  });

  it("omits the params line for a block whose type has no known fields", () => {
    const patch = gx1.driver.blankPatch("Test");
    // A pedal-fx type outside PFX_TYPE_MAPS decodes with no params at all, which leaves the header
    // line with nothing to print under it.
    patch.pedalFx = { on: true, type: "BOGUS TYPE", subType: null, params: {} } as unknown as gx1.Patch["pedalFx"];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("PFX [ON]  BOGUS TYPE");
    expect(output).not.toMatch(/PFX.*\n\s+\w+=/);
  });

  it("omits the params line for an FX slot whose type has no known fields", () => {
    const patch = gx1.driver.blankPatch("Test");
    // An fx type outside the codec's param maps: the builder refuses it, so it can only arrive
    // here the way a file holding it would, decoded straight onto the block.
    patch.fx1 = { on: true, type: "BOGUS EFFECT", subType: null, params: {} } as unknown as gx1.Patch["fx1"];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    printPatch(patch, 0);

    const output = capturedOutput(info);
    expect(output).toContain("FX1 [ON]  BOGUS EFFECT");
    expect(output).not.toMatch(/FX1.*\n\s+\w+=/);
  });
});
