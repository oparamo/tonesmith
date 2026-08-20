import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/devices/gx1";
import { moveBefore } from "../../../../src/devices/gx1/builder";
import { BLOCK_NAMES, DEFAULT_CHAIN } from "../../../../src/devices/gx1/common";
import { ROCK_TONES_FIXTURE, patchAt } from "../../../helpers";

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

  // A sub-model goes in under one name and has to come back out under the same one, so a caller
  // mirroring the block it just read is never rejected for the shape it was handed.
  it("accepts a block's sub-model spelled the way reading it back spells it", () => {
    const built = gx1.driver.buildPatch({
      name: "Wah",
      amp: { type: "TWIN" },
      pedalFx: { type: "WAH", subType: "VO WAH" },
    });

    const read = gx1.driver.decodePatch(gx1.driver.encodePatch(built));
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
    const read = gx1.driver.decodePatch(gx1.driver.encodePatch(built));

    const resend = (): unknown => gx1.driver.buildPatch({
      name: read.name, memo: read.memo, chain: read.chain, key: read.key,
      amp: read.amp, fx1: read.fx1,
    });

    expect(read.fx1.subType, "the case null covers").toBeNull();
    expect(resend).not.toThrow();
  });

  // The same round trip over a patch the device itself wrote, which is where it first failed: a
  // tempo-synced delay came back as a code above the param's ceiling and was rejected as a time
  // nobody could have set.
  it("takes a patch read off the device back as a spec, tempo-synced values included", () => {
    const read = patchAt(ROCK_TONES_FIXTURE, 0);

    const rebuilt = gx1.driver.buildPatch({ ...read });

    expect(read.delay.params.time, "the fixture's own synced delay").toBe("1/4");
    expect(rebuilt.delay.params.time, "survives the rebuild as the note it is").toBe("1/4");
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

      expect(gx1.driver.encodePatch(bypassed)).toEqual(gx1.driver.encodePatch(omitted));
    });
  });
});
