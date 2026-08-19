import { describe, it, expect } from "vitest";
import { validateTypeParams } from "../../../../src/devices/gx1/spec/validate";
import { validatePatchSpec } from "../../../../src/devices/gx1/spec/build";
import { gx1Capabilities } from "../../../../src/devices/gx1/capabilities";

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
    expect(issues[0], "names the param that failed").toContain("SUSTAIN");
    expect(issues[0], "and the type it was checked against").toContain("COMPRESSOR");
    expect(issues[0], "and quotes back the value it rejected").toContain("200");
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
    const issues = validateTypeParams({ group: "pedalFx", type: "PEDAL BEND", subType: "CRY WAH", values: {} });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("PEDAL BEND");
  });

  // Checking only the "declares none" case would let a wrong value on a type that does have
  // variants fall through to the codec's lookup and come back as `Unknown type value: "WOBBLE"`,
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
    expect(issues[0], "names the param that failed").toContain("HIGH CUT");
    expect(issues[0], "and the type it was checked against").toContain("ANALOG");
    expect(issues[0], "and quotes back the value it rejected").toContain("9kHz");
  });
});

describe("validatePatchSpec", () => {
  const amp = { type: "TWIN", params: { gain: 20, bass: 50, middle: 50, treble: 50 } };
  const valid = { name: "Test", amp };

  it("accepts a minimal usable spec", () => {
    expect(validatePatchSpec(valid)).toEqual([]);
  });

  it("names the unknown block and lists the real ones", () => {
    const [issue] = validatePatchSpec({ ...valid, revrb: { type: "HALL S" } });

    expect(issue).toContain("revrb");
    expect(issue).toContain("reverb");
  });

  it("rejects a name longer than the device can store", () => {
    const tooLong = "x".repeat(gx1Capabilities.patchName.maxLength + 1);

    expect(validatePatchSpec({ ...valid, name: tooLong })).not.toEqual([]);
  });

  // The block stores one ASCII byte per character. A character outside that set has no byte, and
  // encoding it would write the low half of its code point as some other letter entirely.
  it("rejects a name the device has no characters for", () => {
    const [issue] = validatePatchSpec({ ...valid, name: "Café" });

    expect(issue).toContain("é");
  });

  // The device gives the amp an on/off byte like every other bypassable block, so a patch that
  // doesn't sound through one is a patch the hardware runs.
  it("accepts a spec that names no amp", () => {
    expect(validatePatchSpec({ name: "Test" })).toEqual([]);
  });

  it("rejects a value of the wrong kind, naming the param", () => {
    const [issue] = validatePatchSpec({ ...valid, noiseGate: { params: { threshold: "loud", release: 40 } } });

    expect(issue).toContain("THRESHOLD");
    expect(issue, "should quote back what it was given").toContain("loud");
  });

  it("rejects a fraction for a param the catalog gives no decimals", () => {
    const spec = { ...valid, delay: { type: "STANDARD", params: { time: 400.5 } } };

    expect(validatePatchSpec(spec)).not.toEqual([]);
  });

  it("accepts a fraction where the catalog gives decimals", () => {
    const spec = { ...valid, reverb: { type: "HALL S", params: { time: 4.5 } } };

    expect(validatePatchSpec(spec)).toEqual([]);
  });

  it("rejects a block that names no type, listing the types it has", () => {
    const [issue] = validatePatchSpec({ ...valid, reverb: { params: { time: 4 } } });

    expect(issue).toContain("HALL S");
  });

  // Without this the type is left unresolved, so every param the caller sent alongside it reads as
  // an unknown key and nothing in the response says the type was the problem.
  it("rejects a type the block doesn't have, listing the ones it does", () => {
    const [issue] = validatePatchSpec({ ...valid, reverb: { type: "HALL XL", params: { time: 4 } } });

    expect(issue).toContain("HALL XL");
    expect(issue).toContain("HALL S");
  });

  // Every block fills what the caller leaves unset from the device's own factory values, so naming
  // the type is the whole obligation. Demanding the controls outright would make a caller invent a
  // value for every knob on a block it only wanted switched on.
  it("accepts a block that names only its type, leaving the rest to default", () => {
    expect(validatePatchSpec({ name: "Test", amp: { type: "TWIN" } })).toEqual([]);
  });

  it("rejects a control the chosen type has no field for", () => {
    const issues = validatePatchSpec({ ...valid, reverb: { type: "TERA ECHO", params: { time: 4, level: 50 } } });

    expect(issues.join("\n")).toContain("time");
  });

  it("names a param sent one level too high as a param of its type, not an unknown key", () => {
    const spec = { ...valid, fx1: { type: "CHORUS", rate: 16 } };
    const [issue] = validatePatchSpec(spec);

    expect(issue).toContain("rate");
    expect(issue, "should say where it belongs").toContain("params");
  });

  it("reports every problem it finds rather than stopping at the first", () => {
    const spec = { ...valid, reverb: { type: "HALL S", params: { time: 99, tone: 999 } } };

    expect(validatePatchSpec(spec)).toHaveLength(2);
  });

  /**
   * `on` and `subType` select a block's shape rather than set a control, so they are filtered out
   * before the param check and reach the builder on trust.
   */
  it.each([
    { label: "a non-boolean on", block: { type: "TWIN", on: "yes" } },
    { label: "a non-string subType", block: { type: "TWIN", subType: 42 } },
  ])("rejects $label", ({ block }) => {
    expect(validatePatchSpec({ name: "Test", amp: block })).toHaveLength(1);
  });

  it.each([
    { label: "a chain that is not an array", spec: { chain: "pedalFx" } },
    { label: "a chain naming a block twice", spec: { chain: ["amp", "amp"] } },
    { label: "a key the device has no name for", spec: { key: "Am" } },
    { label: "a key that is not a string", spec: { key: 5 } },
  ])("rejects $label", ({ spec }) => {
    expect(validatePatchSpec({ ...valid, ...spec })).toHaveLength(1);
  });

  it("accepts a key the device names", () => {
    expect(validatePatchSpec({ ...valid, key: "G" })).toEqual([]);
  });
});
