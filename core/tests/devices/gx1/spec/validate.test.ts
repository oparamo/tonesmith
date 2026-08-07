import { describe, it, expect } from "vitest";
import { validateTypeParams } from "../../../../src/devices/gx1/spec/validate";

describe("validateTypeParams", () => {
  it("reports nothing for an unknown group or type (defers to the builder/codec)", () => {
    const issues = validateTypeParams({ group: "fx", type: "NOPE", values: { sustain: 200 } });

    expect(issues).toEqual([]);
  });

  it("range-checks numeric params and ignores keys with no matching spec", () => {
    const issues = validateTypeParams({
      group: "fx", type: "COMPRESSOR", subType: "ORANGE",
      values: { sustain: 200, attack: 50, bogus: 5 },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("fx SUSTAIN for COMPRESSOR");
  });

  it("merges a subType's own params (delay sub-algorithm) into the checked set", () => {
    const issues = validateTypeParams({
      group: "fx", type: "DELAY", subType: "MODULATE", values: { modRate: 500 },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("MOD RATE");
  });

  // The one input the device cannot report back on: it encodes nowhere, so the patch saves clean
  // and plays as the default. Naming the param that does carry the variant is the whole point of
  // rejecting it here rather than leaving it to the builder.
  it("rejects a subType on a type whose variant is an ordinary param, naming that param", () => {
    const issues = validateTypeParams({ group: "fx", type: "PHASER", subType: "4 STAGE", values: {} });

    expect(issues).toHaveLength(1);
    expect(issues[0], "should point at the param that carries the variant").toContain("params.stage");
    expect(issues[0], "and spell out its values").toContain("12 STAGE");
  });

  it("rejects a subType on a type with no variant at all", () => {
    const issues = validateTypeParams({ group: "pfx", type: "PEDAL BEND", subType: "CRY WAH", values: {} });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("PEDAL BEND");
  });

  // Only the "declares none" case used to be caught, so a wrong value on a type that does have
  // variants fell through to the codec's lookup and came back as `Unknown type value: "WOBBLE"`,
  // naming neither the block, nor the field, nor what it could have been.
  it("rejects a subType the item doesn't declare, listing the ones it does", () => {
    const issues = validateTypeParams({ group: "fx", type: "COMPRESSOR", subType: "WOBBLE", values: {} });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("WOBBLE");
    expect(issues[0], "should list the variants the type does have").toContain("ORANGE");
  });

  it("accepts a subType the item declares", () => {
    const issues = validateTypeParams({ group: "pfx", type: "WAH", subType: "CRY WAH", values: {} });

    expect(issues).toEqual([]);
  });

  it("passes valid numeric and discrete values", () => {
    const issues = validateTypeParams({
      group: "delay", type: "ANALOG", values: { time: 360, highCut: "2kHz" },
    });

    expect(issues).toEqual([]);
  });

  it("checks discrete-value membership", () => {
    const issues = validateTypeParams({
      group: "delay", type: "ANALOG", values: { highCut: "9kHz" },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("delay HIGH CUT for ANALOG");
  });
});
