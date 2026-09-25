import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { blankPatch, newFile, parseFile, serializeFile } from "../../../src/devices/gx1/tsl";
import { RAW } from "../../../src/devices/gx1/common";
import { DEFAULTS_BY_TYPE } from "../../../src/devices/gx1/defaults";
import {
  ROCK_TONES_FIXTURE as FIXTURE, ROCK_TONES_SET_NAME, ROCK_TONES_PATCH_NAMES, DEFAULT_INIT_FIXTURE, present,
} from "../../helpers";

describe("blankPatch", () => {
  it("uses 'NEW PATCH' as the default name", () => {
    const patch = blankPatch();

    expect(patch.name).toBe("NEW PATCH");
  });

  it("accepts a custom name", () => {
    const patch = blankPatch("Test Patch");

    expect(patch.name).toBe("Test Patch");
  });

  // Every block opens off, at the values the device's own factory-init patch carries. The blocks
  // this covers are pinned field by field against that patch in the defaults drift guard.
  it("opens with every block off, at the device's factory settings", () => {
    const patch = blankPatch();

    expect(patch.amp).toMatchObject({ on: false, type: "NATURAL" });
    expect(patch.noiseGate.on).toBe(false);
    expect(patch.drive).toMatchObject({ on: false, type: "OVERDRIVE" });
  });

  // A block left out of a spec keeps what the blank patch opened with, and is switched on later
  // with it, so every block has to open at the device's own values rather than zeros.
  it("carries the device's factory-default patch byte for byte, apart from its name", async () => {
    const factory = present(parseFile(await readFile(DEFAULT_INIT_FIXTURE), "default-init").patches[0], "the factory patch");
    const name = "INIT MEMORY";

    const blank = blankPatch(name);

    expect(factory.name).toBe(name);
    expect(blank[RAW]).toEqual(factory[RAW]);
  });

  it("opens every block that has types at that type's factory defaults", () => {
    const patch = blankPatch();

    expect(patch.delay.params).toEqual(DEFAULTS_BY_TYPE.delay[patch.delay.type]);
    expect(patch.reverb.params).toEqual(DEFAULTS_BY_TYPE.reverb[patch.reverb.type]);
    expect(patch.pedalFx.params).toEqual(DEFAULTS_BY_TYPE.pedalFx[patch.pedalFx.type]);
    for (const slot of ["fx1", "fx2", "fx3"] as const) {
      expect(patch[slot].params, slot).toEqual(DEFAULTS_BY_TYPE.fx[patch[slot].type]);
    }
  });
});

describe("newFile", () => {
  it("takes the given set name and opens with one blank patch", () => {
    const file = newFile("My Set");

    expect(file.name).toBe("My Set");
    expect(file.patches).toHaveLength(1);
  });

  it("creates n patches when nPatches is specified", () => {
    const file = newFile("Three", 3);

    expect(file.patches).toHaveLength(3);
  });

  // The decoded file names its driver, so a consumer holding one can look the driver up; the
  // device's own name for itself is a fact about the file format and stays in the envelope.
  it("names the driver that made it, and keeps the format's own device string in the envelope", () => {
    const file = newFile("Set");

    expect(file.device).toBe("gx1");
    expect(file[RAW].device).toBe("GX-1");
  });
});

describe("parseFile", () => {
  it("returns the set and every patch the fixture holds, in file order", async () => {
    const file = parseFile(await readFile(FIXTURE), FIXTURE);

    expect(file.name).toBe(ROCK_TONES_SET_NAME);
    expect(file.patches.map(patch => patch.name)).toEqual(ROCK_TONES_PATCH_NAMES);
  });

  it("attaches the raw envelope via RAW symbol", async () => {
    const file = parseFile(await readFile(FIXTURE), FIXTURE);

    expect(file[RAW].device).toBe("GX-1");
  });

  it("names the driver that read it", async () => {
    const file = parseFile(await readFile(FIXTURE), FIXTURE);

    expect(file.device).toBe("gx1");
  });

  // Anything can be handed to a tool that takes a path, and without this check what comes back is
  // a TypeError from whichever field the codec reaches for first, naming neither the file nor
  // what is wrong with it.
  describe("a file that is not one of this device's", () => {
    const parseGiven = (contents: unknown) => () =>
      parseFile(new TextEncoder().encode(JSON.stringify(contents)), "not-a-patch-file.tsl");

    it("rejects JSON that is not a patch file at all", () => {
      const parse = parseGiven({ hello: "world" });

      expect(parse).toThrow("not-a-patch-file.tsl");
    });

    it("rejects a file another device wrote, naming the device it holds", () => {
      const parse = parseGiven({ name: "Set", formatRev: "0000", device: "GT-1000", data: [[], []] });

      expect(parse).toThrow(/GT-1000/);
    });

    it("rejects a patch missing a block the codec reads", () => {
      const patch = { paramSet: { "MEMORY%COM": ["41"] } };
      const parse = parseGiven({ name: "Set", formatRev: "0000", device: "GX-1", data: [[patch], []] });

      expect(parse).toThrow(/MEMORY%/);
    });
  });
});

describe("serializeFile + parseFile round-trip", () => {
  it("round-trips with identical patch names", async () => {
    const original = parseFile(await readFile(FIXTURE), FIXTURE);

    const reloaded = parseFile(serializeFile(original), "round-trip");

    const reloadedNames = reloaded.patches.map(patch => patch.name);
    const originalNames = original.patches.map(patch => patch.name);
    expect(reloadedNames).toEqual(originalNames);
  });

  it("preserves all paramSet keys byte-for-byte", async () => {
    const fixtureBytes = await readFile(FIXTURE);
    const original = parseFile(fixtureBytes, FIXTURE);

    const origRaw = JSON.parse(new TextDecoder().decode(fixtureBytes)) as {
      data: [{ paramSet: Record<string, string[]> }[], unknown[]];
    };
    const writtenRaw = JSON.parse(new TextDecoder().decode(serializeFile(original))) as typeof origRaw;

    for (const [index, originalPatch] of origRaw.data[0].entries()) {
      const writtenParamSet = present(writtenRaw.data[0][index], `written patch ${index}`).paramSet;
      for (const key of Object.keys(originalPatch.paramSet)) {
        expect(writtenParamSet[key], `patch ${index} key ${key}`).toEqual(originalPatch.paramSet[key]);
      }
    }
  });

  it("writes a blank file and reads it back", () => {
    const file = newFile("Test Set", 2);

    const reloaded = parseFile(serializeFile(file), "round-trip");

    expect(reloaded.patches).toHaveLength(2);
    expect(reloaded.name).toBe("Test Set");
  });

  // PatchDriver.serializeFile takes a device-agnostic PatchFile, which anyone can assemble by
  // hand; this writer starts from the bytes the file was parsed from and has none for such a file.
  it("refuses a file it never parsed", () => {
    const assembled = { name: "Set", device: "GX-1", patches: newFile("Set", 1).patches };

    const serializeAssembled = () => serializeFile(assembled);

    expect(serializeAssembled).toThrow();
  });
});
