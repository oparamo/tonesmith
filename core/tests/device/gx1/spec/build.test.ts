import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/device/gx1";
import { validatePatchSpec } from "../../../../src/device/gx1/spec/build";
import { gx1Capabilities } from "../../../../src/device/gx1/catalog/capabilities";
import { BLOCK_NAMES, DEFAULT_CHAIN } from "../../../../src/device/gx1/model";
import { ROCK_TONES_FIXTURE, moveBefore, patchAt, storedAs } from "../../../helpers";

describe("buildPatch", () => {
  it("builds every block the spec names, defaults filled in", () => {
    const patch = gx1.driver.buildPatch({
      name: "Ojitos Lindos",
      amp: { type: "TRNSPRNT", params: { gain: 12, bass: 48, middle: 45, treble: 55, level: 100 } },
      delay: { type: "ANALOG", params: { time: 400, feedback: 30, level: 48, highCut: "4kHz" } },
      reverb: { type: "SHIMMER", params: { time: 4, tone: -3, preDelay: 25, level: 55, pitch: 12, pitchLevel: 45 } },
    });

    expect(patch.name).toBe("Ojitos Lindos");
    expect(patch.delay.params.time).toBe(400);
    expect(patch.reverb.params.pitch).toBe(12);
    expect(patch.chain).toEqual(DEFAULT_CHAIN);
  });

  // A TERA ECHO reverb has no TIME, DENSITY or PRE-DELAY. The blank patch's reverb does, and a
  // patch carrying them would show settings its file never stores.
  it("builds a type with only the fields that type stores", () => {
    const patch = gx1.driver.buildPatch({
      name: "Tera",
      reverb: { type: "TERA ECHO", params: { level: 60, direct: 100, spreadTime: 50, feedback: 40, trigger: false } },
    });

    expect(Object.keys(patch.reverb.params)).not.toContain("time");
    expect(Object.keys(patch.reverb.params)).not.toContain("density");
  });

  // A sub-model goes in under one name and has to come back out under the same one, so a caller
  // mirroring the block it just read is never rejected for the shape it was handed.
  it("accepts a block's sub-model spelled the way reading it back spells it", () => {
    const built = gx1.driver.buildPatch({
      name: "Wah",
      amp: { type: "TWIN" },
      pedalFx: { type: "WAH", subType: "VO WAH" },
    });

    const read = storedAs(gx1.driver, built);
    const echoed = (): unknown => gx1.driver.buildPatch({
      name: "Wah Again",
      amp: { type: "TWIN" },
      pedalFx: { type: read.pedalFx.type, subType: read.pedalFx.subType },
    });

    expect(read.pedalFx.subType).toBe("VO WAH");
    expect(echoed).not.toThrow();
  });

  // A block read back from a file is a block the spec has to take, which is the whole point of the
  // two sharing a shape. A type with no variants decodes `subType: null`, so null has to mean the
  // same thing here as leaving the field out.
  it("takes a whole decoded patch back as a spec, unedited", () => {
    const built = gx1.driver.buildPatch({
      name: "Round Trip",
      amp: { type: "TWIN" },
      fx1: { type: "TREMOLO" },
    });
    const read = storedAs(gx1.driver, built);

    const resend = (): unknown => gx1.driver.buildPatch({
      name: read.name, memo: read.memo, chain: read.chain, bpm: read.bpm, key: read.key,
      amp: read.amp, fx1: read.fx1,
    });

    expect(read.fx1.subType, "the case null covers").toBeNull();
    expect(resend).not.toThrow();
  });

  // The same round trip over a patch the device itself wrote, which is where it first failed: a
  // tempo-synced delay came back as a code above the param's ceiling and was rejected as a time
  // nobody could have set.
  it("takes a patch read off the device back as a spec, tempo-synced values included", async () => {
    const read = await patchAt(ROCK_TONES_FIXTURE, 0);

    const rebuilt = gx1.driver.buildPatch({ ...read });

    expect(read.delay.params.time, "the fixture's own synced delay").toBe("1/4");
    expect(rebuilt.delay.params.time, "survives the rebuild as the note it is").toBe("1/4");
    expect(rebuilt.bpm, "against the tempo that says how long that note lasts").toBe(read.bpm);
  });

  it("puts a block's params where the decoded patch keeps them", () => {
    const patch = gx1.driver.buildPatch({
      name: "Chorus",
      amp: { type: "TWIN", params: { gain: 20, bass: 50, middle: 50, treble: 50 } },
      fx1: { type: "CHORUS", subType: "STEREO", params: { rate: 20, depth: 35 } },
    });

    expect(patch.fx1.params.rate).toBe(20);
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

    expect(patch.chain).toEqual(reordered);
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

  // Validation runs against the catalog and the builder runs against the codec's own field maps.
  // The catalog is derived from those maps, so the two agree, but a spec that got past validation
  // and then threw at the builder would be a drift the caller can do nothing about.
  it("reports a rejection before any block is built", () => {
    const build = (): unknown => gx1.driver.buildPatch({
      name: "Bad",
      amp: { type: "TWIN", params: { gain: 20, bass: 50, middle: 50, treble: 50 } },
      delay: { type: "TWIST", time: 400 },
    });

    expect(build).toThrow(/time/);
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
      expect(patch.delay.on).toBe(true);
      expect(patch.delay.params.time).toBe(400);
    });

    // `{ on: false }` alone and leaving the block out say the same thing, so they have to produce
    // the same patch rather than the second one demanding a type for a block it is switching off.
    it("treats a bare `on: false` as leaving the block out", () => {
      const omitted = gx1.driver.buildPatch(delayOnly);
      const bypassed = gx1.driver.buildPatch({ ...delayOnly, amp: { on: false } });

      expect(bypassed.amp).toEqual(omitted.amp);
    });

    it("still requires a type from an amp the patch does sound through", () => {
      const build = () => gx1.driver.buildPatch({ ...delayOnly, amp: { on: true } });

      expect(build, "names the block that needs one").toThrow(/amp/);
      expect(build, "and the models it offers").toThrow(/JC-120/);
    });
  });

  // The amp case above states the rule; this holds it for every block the device can bypass.
  // Compared through the codec rather than the built objects, since the bytes are what a caller
  // ends up with: whichever of the two spellings an agent picks must not change the file.
  describe("a block written off and a block left out", () => {
    const bypassable = BLOCK_NAMES.filter(name => name !== "volume");

    it.each(bypassable)("%s encodes identically either way", (block) => {
      const omitted = gx1.driver.buildPatch({ name: "Bypass" });
      const bypassed = gx1.driver.buildPatch({ name: "Bypass", [block]: { on: false } });

      expect(storedAs(gx1.driver, bypassed)).toEqual(storedAs(gx1.driver, omitted));
    });
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

  it("accepts every patch setting at a value the device stores", () => {
    const settings = { memoryLevel: 0, bpm: 250, key: "F#", carryover: false, tempoHold: true };

    expect(validatePatchSpec({ ...valid, ...settings })).toEqual([]);
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

      expect(rest).toEqual([]);
      expect(issue, "names the setting").toContain(label);
      expect(issue, "and what it accepts").toContain(accepted);
      expect(issue, "and quotes back what it rejected").toContain(JSON.stringify(value));
    }
  );

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

  it("rejects a sub-model named among the params, where the decoded block never carries it", () => {
    const issues = validatePatchSpec({ ...valid, pedalFx: { type: "WAH", params: { subType: "CRY WAH" } } });

    expect(issues.join("\n")).toContain("subType");
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
