import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/devices/gx1";

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
    expect(patch.chain).toEqual(gx1.DEFAULT_CHAIN);
  });

  // A sub-model goes in under one name and has to come back out under the same one. Pedal WAH read
  // back as the codec's own field name, so a caller mirroring what it just read was rejected for
  // sending a key the block had no field for.
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
    const reordered = gx1.moveBefore(gx1.DEFAULT_CHAIN, "REV", "DLY");
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
});
