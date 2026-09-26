/**
 * Building a spec back from a decoded patch, and rebuilding what a spec produced from what a caller
 * reads back: these cross the builder, the codec and a committed fixture on purpose, so they live
 * apart from build.test.ts's unit-level checks.
 */
import { describe, it, expect } from "vitest";
import * as gx1 from "../../../src/device/gx1";
import { ROCK_TONES_FIXTURE, patchAt } from "../../device/gx1/helpers";
import { storedAs } from "../../helpers";

describe("a decoded patch builds again unchanged", () => {
  // A sub-model goes in under one name and has to come back out under the same one, so a caller
  // mirroring the block it just read is never rejected for the shape it was handed.
  it("a decoded pedalFx sub-model builds again unchanged", () => {
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

  // The same round trip over a patch the device itself wrote, whose tempo-synced delay decodes as a
  // note value that has to build again as that note.
  it("takes a patch read off the device back as a spec, tempo-synced values included", async () => {
    const read = await patchAt(ROCK_TONES_FIXTURE, 0);

    const rebuilt = gx1.driver.buildPatch({ ...read });

    expect(read.delay.params.time, "the fixture's own synced delay").toBe("1/4");
    expect(rebuilt.delay.params.time, "survives the rebuild as the note it is").toBe("1/4");
    expect(rebuilt.bpm, "against the tempo that says how long that note lasts").toBe(read.bpm);
  });
});
