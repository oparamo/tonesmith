import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/device/gx1";
import { validatePatchSpec } from "../../../../src/device/gx1/spec/build";
import { gx1Capabilities } from "../../../../src/device/gx1/catalog/capabilities";
import { BLOCK_NAMES, DEFAULT_CHAIN } from "../../../../src/device/gx1/model";
import { moveBefore } from "../helpers";

describe("buildPatch", () => {
  it("carries the spec's name onto the patch", () => {
    const patch = gx1.driver.buildPatch({ name: "Ojitos Lindos" });

    expect(patch.name).toBe("Ojitos Lindos");
  });

  it("passes each block's params to the builder", () => {
    const patch = gx1.driver.buildPatch({
      name: "Ojitos Lindos",
      delay: { type: "ANALOG", params: { time: 400, feedback: 30, level: 48, highCut: "4kHz" } },
      reverb: { type: "SHIMMER", params: { time: 4, tone: -3, preDelay: 25, level: 55, pitch: 12, pitchLevel: 45 } },
    });

    expect(patch.delay.params.time).toBe(400);
    expect(patch.reverb.params.pitch).toBe(12);
  });

  it("opens on the default chain when the spec names none", () => {
    const patch = gx1.driver.buildPatch({ name: "Ojitos Lindos" });

    expect(patch.chain).toStrictEqual(DEFAULT_CHAIN);
  });

  it("leaves out every block the spec doesn't name", () => {
    const patch = gx1.driver.buildPatch({
      name: "Dry",
      amp: { type: "TWIN", params: { gain: 20, bass: 50, middle: 50, treble: 50 } },
    });

    expect(patch.reverb.on).toBe(false);
    expect(patch.delay.on).toBe(false);
  });

  it("takes a chain the spec supplies over the default order", () => {
    const reordered = moveBefore(DEFAULT_CHAIN, "reverb", "delay");
    const patch = gx1.driver.buildPatch({
      name: "Reordered",
      chain: reordered,
      amp: { type: "TWIN", params: { gain: 20, bass: 50, middle: 50, treble: 50 } },
    });

    expect(patch.chain).toStrictEqual(reordered);
  });

  it("throws every issue at once rather than the first", () => {
    const build = (): unknown => gx1.driver.buildPatch({
      name: "Bad",
      amp: { type: "TWIN", params: { gain: 20, bass: 50, middle: 50, treble: 50 } },
      reverb: { type: "HALL S", params: { time: 99, tone: 999 } },
    });

    expect(build).toThrow(/TIME/);
    expect(build).toThrow(/TONE/);
  });

  // FX1 and FX2 have no MEMORY%FX3A block, so OVERTONE's params would land at offset 0 of the
  // shared 251-byte block, on top of COMPRESSOR's window and the factory defaults living in it.
  it("rejects OVERTONE in an fx slot that cannot hold it, naming the one that can", () => {
    const build = (): unknown => gx1.driver.buildPatch({
      name: "Overtone",
      amp: { type: "TWIN" },
      fx1: { type: "OVERTONE", params: { lower: 60 } },
    });

    expect(build).toThrow(/OVERTONE/);
    expect(build).toThrow(/fx3/);
  });

  it("accepts OVERTONE in fx3", () => {
    const patch = gx1.driver.buildPatch({
      name: "Overtone",
      amp: { type: "TWIN" },
      fx3: { type: "OVERTONE", params: { lower: 60 } },
    });

    expect(patch.fx3.params.lower).toBe(60);
  });

  // The amp carries its own on/off byte, so the device runs a patch with it bypassed. What such a
  // patch is for is the player's business.
  describe("an amp the patch does not sound through", () => {
    const delayOnly = { name: "Delay Only", delay: { type: "ANALOG", params: { time: 400, feedback: 30, level: 48 } } };

    it("builds a patch with no amp block at all, leaving it off at factory defaults", () => {
      const patch = gx1.driver.buildPatch(delayOnly);

      expect(patch.amp).toMatchObject({ on: false, type: "NATURAL" });
    });

    // `{ on: false }` alone and leaving the block out say the same thing, so every block the
    // device can bypass has to build the same patch either way.
    it.each(BLOCK_NAMES.filter(name => gx1Capabilities.chain.blocks[name]?.bypass))(
      "%s builds identically whether written off or left out",
      (name) => {
        const omitted = gx1.driver.buildPatch({ name: "Bypass" });
        const bypassed = gx1.driver.buildPatch({ name: "Bypass", [name]: { on: false } });

        expect(bypassed[name as keyof typeof bypassed]).toStrictEqual(omitted[name as keyof typeof omitted]);
      }
    );
  });

  describe("patch settings a spec carries", () => {
    it.each([
      { field: "memoryLevel", value: 5 },
      { field: "bpm", value: 250 },
      { field: "key", value: "F#" },
      { field: "carryover", value: false },
      { field: "tempoHold", value: true },
    ])("$field lands on the built patch", ({ field, value }) => {
      const patch = gx1.driver.buildPatch({ name: "Test", [field]: value });

      expect((patch as unknown as Record<string, unknown>)[field]).toBe(value);
    });
  });

  it("lands a string memo on the built patch", () => {
    const patch = gx1.driver.buildPatch({ name: "Test", memo: "left it in drop D" });

    expect(patch.memo).toBe("left it in drop D");
  });
});

describe("validatePatchSpec", () => {
  const amp = { type: "TWIN", params: { gain: 20, bass: 50, middle: 50, treble: 50 } };
  const valid = { name: "Test", amp };

  it("accepts a minimal usable spec", () => {
    expect(validatePatchSpec(valid)).toStrictEqual([]);
  });

  it("reports a missing name rather than throwing, for a non-object input", () => {
    expect(validatePatchSpec(null)).toContainEqual(expect.stringContaining("name"));
  });

  it.each([
    { label: "no name at all", spec: {} },
    { label: "an empty name", spec: { name: "" } },
    { label: "a non-string name", spec: { name: 5 } },
  ])("rejects $label", ({ spec }) => {
    const [issue] = validatePatchSpec(spec);

    expect(issue).toContain("name");
  });

  it("accepts a name exactly at the device's length limit", () => {
    const atLimit = "x".repeat(gx1Capabilities.patchName.maxLength);

    expect(validatePatchSpec({ ...valid, name: atLimit })).toStrictEqual([]);
  });

  it("names the unknown block and lists the real ones", () => {
    const [issue] = validatePatchSpec({ ...valid, revrb: { type: "HALL S" } });

    expect(issue).toContain("revrb");
    expect(issue).toContain("reverb");
  });

  it("rejects a name longer than the device can store", () => {
    const tooLong = "x".repeat(gx1Capabilities.patchName.maxLength + 1);

    expect(validatePatchSpec({ ...valid, name: tooLong })).not.toStrictEqual([]);
  });

  // The block stores one ASCII byte per character. A character outside that set has no byte, and
  // encoding it would write the low half of its code point as some other letter entirely.
  it("rejects a name the device has no characters for", () => {
    const [issue] = validatePatchSpec({ ...valid, name: "Café" });

    expect(issue).toContain("é");
  });

  it("rejects a non-string memo", () => {
    const [issue] = validatePatchSpec({ ...valid, memo: 5 });

    expect(issue).toContain("memo");
  });

  it("rejects a chain with a non-string element", () => {
    expect(validatePatchSpec({ ...valid, chain: ["amp", 5] })).toHaveLength(1);
  });

  // The device gives the amp an on/off byte like every other bypassable block, so a patch that
  // doesn't sound through one is a patch the hardware runs.
  it("accepts a spec that names no amp", () => {
    expect(validatePatchSpec({ name: "Test" })).toStrictEqual([]);
  });

  it("accepts every patch setting at a value the device stores", () => {
    const settings = { memoryLevel: 0, bpm: 250, key: "F#", carryover: false, tempoHold: true };

    expect(validatePatchSpec({ ...valid, ...settings })).toStrictEqual([]);
  });

  const unstorableSettings = [
    { field: "memoryLevel", value: 201, label: "MEMORY LEVEL", accepted: "200" },
    { field: "bpm", value: 39, label: "BPM", accepted: "40" },
    { field: "key", value: "H", label: "KEY", accepted: "F#" },
    { field: "carryover", value: "yes", label: "CARRYOVER", accepted: "true" },
    { field: "tempoHold", value: 1, label: "TEMPO HOLD", accepted: "true" },
  ];

  it.each(unstorableSettings)(
    "rejects $field outside what the device stores, naming the setting and what it takes",
    ({ field, value, label, accepted }) => {
      const [issue, ...rest] = validatePatchSpec({ ...valid, [field]: value });

      expect(rest).toStrictEqual([]);
      expect(issue, "names the setting").toContain(label);
      expect(issue, "and what it accepts").toContain(accepted);
      expect(issue, "and quotes back what it rejected").toContain(JSON.stringify(value));
    }
  );

  it.each([
    { label: "a chain that is not an array", spec: { chain: "pedalFx" } },
    { label: "a chain naming a block twice", spec: { chain: ["amp", "amp"] } },
  ])("rejects $label", ({ spec }) => {
    expect(validatePatchSpec({ ...valid, ...spec })).toHaveLength(1);
  });

  it("accepts a key the device names", () => {
    expect(validatePatchSpec({ ...valid, key: "G" })).toStrictEqual([]);
  });
});
