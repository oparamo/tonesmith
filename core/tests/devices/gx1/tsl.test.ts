import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blankPatch, newFile, readFile, writeFile } from "../../../src/devices/gx1/tsl";
import { RAW } from "../../../src/devices/gx1/common";
import {
  ROCK_TONES_FIXTURE as FIXTURE, ROCK_TONES_SET_NAME, ROCK_TONES_PATCH_NAMES,
  present, scratchDir, scratchFile,
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

describe("readFile", () => {
  it("returns the set and every patch the fixture holds, in file order", () => {
    const file = readFile(FIXTURE);

    expect(file.name).toBe(ROCK_TONES_SET_NAME);
    expect(file.patches.map(patch => patch.name)).toEqual(ROCK_TONES_PATCH_NAMES);
  });

  it("attaches the raw envelope via RAW symbol", () => {
    const file = readFile(FIXTURE);

    expect(file[RAW].device).toBe("GX-1");
  });

  it("names the driver that read it", () => {
    const file = readFile(FIXTURE);

    expect(file.device).toBe("gx1");
  });

  // Anything can be handed to a tool that takes a path, and without this check what comes back is
  // a TypeError from whichever field the codec reaches for first, naming neither the file nor
  // what is wrong with it.
  describe("a file that is not one of this device's", () => {
    const badPath = scratchFile("not-a-patch-file.tsl");

    const readWritten = (contents: unknown) => {
      writeFileSync(badPath(), JSON.stringify(contents));
      return () => readFile(badPath());
    };

    it("rejects JSON that is not a patch file at all", () => {
      const read = readWritten({ hello: "world" });

      expect(read).toThrow(badPath());
    });

    it("rejects a file another device wrote, naming the device it holds", () => {
      const read = readWritten({ name: "Set", formatRev: "0000", device: "GT-1000", data: [[], []] });

      expect(read).toThrow(/GT-1000/);
    });

    it("rejects a patch missing a block the codec reads", () => {
      const patch = { paramSet: { "MEMORY%COM": ["41"] } };
      const read = readWritten({ name: "Set", formatRev: "0000", device: "GX-1", data: [[patch], []] });

      expect(read).toThrow(/MEMORY%/);
    });
  });
});

describe("writeFile + readFile round-trip", () => {
  const scratch = scratchDir();
  const tmpPath = (): string => join(scratch(), "written-set.tsl");

  it("written file can be read back with identical patch names", () => {
    const original = readFile(FIXTURE);

    writeFile(original, tmpPath());
    const reloaded = readFile(tmpPath());

    const reloadedNames = reloaded.patches.map(patch => patch.name);
    const originalNames = original.patches.map(patch => patch.name);
    expect(reloadedNames).toEqual(originalNames);
  });

  it("written file preserves all paramSet keys byte-for-byte", () => {
    const original = readFile(FIXTURE);

    writeFile(original, tmpPath());

    const origFileContents = readFileSync(FIXTURE, "utf8");
    const origRaw = JSON.parse(origFileContents) as {
      data: [{ paramSet: Record<string, string[]> }[], unknown[]];
    };
    const writtenFileContents = readFileSync(tmpPath(), "utf8");
    const writtenRaw = JSON.parse(writtenFileContents) as typeof origRaw;

    for (const [index, originalPatch] of origRaw.data[0].entries()) {
      const writtenParamSet = present(writtenRaw.data[0][index], `written patch ${index}`).paramSet;
      for (const key of Object.keys(originalPatch.paramSet)) {
        expect(writtenParamSet[key], `patch ${index} key ${key}`).toEqual(originalPatch.paramSet[key]);
      }
    }
  });

  it("writes a blank file and reads it back", () => {
    const file = newFile("Test Set", 2);

    writeFile(file, tmpPath());
    const reloaded = readFile(tmpPath());

    expect(reloaded.patches).toHaveLength(2);
    expect(reloaded.name).toBe("Test Set");
  });

  // PatchDriver.writeFile takes a device-agnostic PatchFile, which anyone can assemble by hand;
  // this writer starts from the bytes the file was read as and has none for such a file.
  it("refuses a file it never read, naming the path and the reason", () => {
    const assembled = { name: "Set", device: "GX-1", patches: newFile("Set", 1).patches };

    const writeAssembled = () => { writeFile(assembled, tmpPath()); };

    expect(writeAssembled).toThrow(tmpPath());
    expect(existsSync(tmpPath()), "nothing written").toBe(false);
  });

  it("creates missing parent directories", () => {
    const nestedPath = join(scratch(), "sub", "patch.tsl");
    const file = newFile("Nested Set", 1);

    writeFile(file, nestedPath);

    expect(existsSync(nestedPath)).toBe(true);
  });
});
