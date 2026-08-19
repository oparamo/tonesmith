import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/devices/gx1";
import { DEFAULT_CHAIN, moveBefore } from "../../../../src/devices/gx1/builder";
import { BLOCK_NAMES } from "../../../../src/devices/gx1/common";

describe("buildPatch", () => {
  it("builds every block the spec names, defaults filled in", () => {
    const patch = gx1.driver.buildPatch({
      name: "Ojitos Lindos",
      amp: { type: "TRNSPRNT", gain: 12, bass: 48, middle: 45, treble: 55, level: 100 },
      delay: { type: "ANALOG", time: 400, feedback: 30, level: 48, highCut: "4kHz" },
      reverb: { type: "SHIMMER", time: 4, tone: -3, preDelay: 25, level: 55, pitch: 12, pitchLevel: 45 },
    });

    expect(patch.name).toBe("Ojitos Lindos");
    expect(patch.delay.time).toBe(400);
    expect(patch.reverb.pitch).toBe(12);
    expect(patch.chain).toEqual(DEFAULT_CHAIN);
  });

  // A sub-model goes in under one name and has to come back out under the same one. Pedal WAH reads
  // back as the codec's own field name, so a caller mirroring what it just read would otherwise be
  // rejected for sending a key the block has no field for.
  it("accepts a block's sub-model spelled the way reading it back spells it", () => {
    const built = gx1.driver.buildPatch({
      name: "Wah",
      amp: { type: "TWIN" },
      pfx: { type: "WAH", subType: "VO WAH" },
    });

    const read = gx1.driver.decodePatch(gx1.driver.encodePatch(built));
    const echoed = (): unknown => gx1.driver.buildPatch({
      name: "Wah Again",
      amp: { type: "TWIN" },
      pfx: { type: read.pfx.type, subType: read.pfx.subType },
    });

    expect(read.pfx.subType).toBe("VO WAH");
    expect(echoed).not.toThrow();
  });

  it("nests fx params the way the decoded patch does", () => {
    const patch = gx1.driver.buildPatch({
      name: "Chorus",
      amp: { type: "TWIN", gain: 20, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "CHORUS", subType: "STEREO", params: { rate: 20, depth: 35 } },
    });

    expect(patch.fx1.params.rate).toBe(20);
  });

  it("leaves out every block the spec doesn't name", () => {
    const patch = gx1.driver.buildPatch({
      name: "Dry",
      amp: { type: "TWIN", gain: 20, bass: 50, middle: 50, treble: 50 },
    });

    expect(patch.reverb.on).toBe(false);
    expect(patch.delay.on).toBe(false);
  });

  it("takes a chain the spec supplies over the default order", () => {
    const reordered = moveBefore(DEFAULT_CHAIN, "REV", "DLY");
    const patch = gx1.driver.buildPatch({
      name: "Reordered",
      chain: reordered,
      amp: { type: "TWIN", gain: 20, bass: 50, middle: 50, treble: 50 },
    });

    expect(patch.chain).toEqual(reordered);
  });

  it("throws every issue at once rather than the first", () => {
    const build = (): unknown => gx1.driver.buildPatch({
      name: "Bad",
      amp: { type: "TWIN", gain: 20, bass: 50, middle: 50, treble: 50 },
      reverb: { type: "HALL S", time: 99, tone: 999 },
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
      amp: { type: "TWIN", gain: 20, bass: 50, middle: 50, treble: 50 },
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
    const delayOnly = { name: "Delay Only", delay: { type: "ANALOG", time: 400, feedback: 30, level: 48 } };

    it("builds a patch with no amp block at all, leaving it off at factory defaults", () => {
      const patch = gx1.driver.buildPatch(delayOnly);

      expect(patch.amp).toMatchObject({ on: false, type: "NATURAL" });
      expect(patch.delay).toMatchObject({ on: true, time: 400 });
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
    const bypassable = BLOCK_NAMES.filter(name => name !== "fv");

    it.each(bypassable)("%s encodes identically either way", (block) => {
      const omitted = gx1.driver.buildPatch({ name: "Bypass" });
      const bypassed = gx1.driver.buildPatch({ name: "Bypass", [block]: { on: false } });

      expect(gx1.driver.encodePatch(bypassed)).toEqual(gx1.driver.encodePatch(omitted));
    });
  });
});
