import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { blankPatch, newFile, parseFile, serializeFile } from "../../../../src/device/gx1/format/tsl";
import { encodeName } from "../../../../src/device/gx1/format/codec/blocks";
import { FACTORY_BLOCKS } from "../../../../src/device/gx1/format/factoryPatch";
import { RAW } from "../../../../src/device/gx1/model";
import { ROCK_TONES_FIXTURE as FIXTURE, ROCK_TONES_SET_NAME, ROCK_TONES_PATCH_NAMES } from "../helpers";
import { present } from "../../../helpers";

describe("blankPatch", () => {
  it("uses 'NEW PATCH' as the default name", () => {
    const patch = blankPatch();

    expect(patch.name).toBe("NEW PATCH");
  });

  it("accepts a custom name", () => {
    const patch = blankPatch("Test Patch");

    expect(patch.name).toBe("Test Patch");
  });

  // A block left out of a spec keeps what the blank patch opened with, and is switched on later
  // with it, so every block has to open at the device's own values rather than zeros. FACTORY_BLOCKS
  // is pinned field by field against the device's own factory patch in factoryPatch.test.ts.
  it("writes the name block over the factory blocks, leaving every other block as the factory has it", () => {
    const name = "INIT MEMORY";

    const blank = blankPatch(name);

    expect(blank[RAW]["MEMORY%COM"]).toStrictEqual(encodeName(name));
    expect(blank[RAW]["MEMORY%CHAIN"]).toStrictEqual(present(FACTORY_BLOCKS["MEMORY%CHAIN"], "MEMORY%CHAIN").match(/../g));
    expect(blank[RAW]["MEMORY%AMP"]).toStrictEqual(present(FACTORY_BLOCKS["MEMORY%AMP"], "MEMORY%AMP").match(/../g));
  });

  it("throws on a name longer than the device stores rather than opening with a truncation", () => {
    const openWithLongName = () => blankPatch("x".repeat(17));

    expect(openWithLongName).toThrow(/16/);
  });
});

describe("newFile", () => {
  it("names the set", () => {
    const file = newFile("My Set");

    expect(file.name).toBe("My Set");
  });

  it("opens one patch by default", () => {
    const file = newFile("My Set");

    expect(file.patches).toHaveLength(1);
  });

  it("opens patchCount blank patches", () => {
    const file = newFile("Three", 3);

    expect(file.patches).toHaveLength(3);
  });

  it("opens zero patches when patchCount is 0", () => {
    const file = newFile("Empty", 0);

    expect(file.patches).toHaveLength(0);
  });

  // The decoded file names its driver, so a consumer holding one can look the driver up; the
  // device's own name for itself is a fact about the file format and stays in the envelope.
  it("names the gx1 driver", () => {
    const file = newFile("Set");

    expect(file.device).toBe("gx1");
  });

  it("writes GX-1 as the envelope's device", () => {
    const file = newFile("Set");

    expect(file[RAW].device).toBe("GX-1");
  });
});

describe("parseFile", () => {
  it("returns the set and every patch the fixture holds, in file order", async () => {
    const file = parseFile(await readFile(FIXTURE), FIXTURE);

    expect(file.name).toBe(ROCK_TONES_SET_NAME);
    expect(file.patches.map(patch => patch.name)).toStrictEqual(ROCK_TONES_PATCH_NAMES);
  });

  it("attaches the raw envelope via RAW symbol", async () => {
    const file = parseFile(await readFile(FIXTURE), FIXTURE);

    expect(file[RAW].device).toBe("GX-1");
  });

  it("names the driver that read it", async () => {
    const file = parseFile(await readFile(FIXTURE), FIXTURE);

    expect(file.device).toBe("gx1");
  });

  it("returns zero patches for an envelope whose patch list is empty", () => {
    const envelope = { name: "Set", formatRev: "0000", device: "GX-1", data: [[], []] };

    const file = parseFile(new TextEncoder().encode(JSON.stringify(envelope)), "empty.tsl");

    expect(file.patches).toHaveLength(0);
  });

  // Anything can be handed to a tool that takes a path, and without this check what comes back is
  // a TypeError from whichever field the codec reaches for first, naming neither the file nor
  // what is wrong with it.
  describe("a file that is not one of this device's", () => {
    const parseGiven = (contents: unknown) => () =>
      parseFile(new TextEncoder().encode(JSON.stringify(contents)), "not-a-patch-file.tsl");

    it("rejects bytes that are not JSON at all, naming the file like every other rejection here", () => {
      const parse = () => parseFile(new TextEncoder().encode("not json"), "not-a-patch-file.tsl");

      expect(parse).toThrow("not-a-patch-file.tsl");
    });

    it("rejects JSON that is not a patch file at all", () => {
      const parse = parseGiven({ hello: "world" });

      expect(parse).toThrow("not-a-patch-file.tsl");
    });

    it("rejects a null envelope", () => {
      const parse = () => parseFile(new TextEncoder().encode("null"), "not-a-patch-file.tsl");

      expect(parse).toThrow("not-a-patch-file.tsl");
    });

    it("rejects a file another device wrote, naming the device it holds", () => {
      const parse = parseGiven({ name: "Set", formatRev: "0000", device: "GT-1000", data: [[], []] });

      expect(parse).toThrow(/GT-1000/);
    });

    it("rejects an envelope whose data field holds no list of patches", () => {
      const parse = parseGiven({ name: "Set", formatRev: "0000", device: "GX-1", data: "not-a-list" });

      expect(parse).toThrow(/"data"/);
    });

    it("rejects a patch that carries no paramSet, naming its index", () => {
      const parse = parseGiven({ name: "Set", formatRev: "0000", device: "GX-1", data: [[{}], []] });

      expect(parse).toThrow(/\b0\b/);
    });

    it("rejects a patch missing a block the codec reads, naming it", () => {
      const patch = { paramSet: { "MEMORY%COM": ["41"] } };
      const parse = parseGiven({ name: "Set", formatRev: "0000", device: "GX-1", data: [[patch], []] });

      expect(parse).toThrow(/MEMORY%CHAIN/);
    });
  });
});

describe("serializeFile + parseFile round-trip", () => {
  it("writes a renamed set under its new name", () => {
    const file = { ...newFile("Original"), name: "Renamed" };

    const reloaded = parseFile(serializeFile(file), "round-trip");

    expect(reloaded.name).toBe("Renamed");
  });

  it("carries formatRev and the envelope's second data array through", () => {
    const file = newFile("Set");

    const reloaded = JSON.parse(new TextDecoder().decode(serializeFile(file))) as {
      formatRev: string; data: [unknown[], unknown[]];
    };

    expect(reloaded.formatRev).toBe(file.formatRev);
    expect(reloaded.data[1]).toStrictEqual(file[RAW].data[1]);
  });

  it("preserves envelope fields this driver does not know about", async () => {
    const original = parseFile(await readFile(FIXTURE), FIXTURE);
    const withExtra = { ...original, [RAW]: { ...original[RAW], extraField: "kept" } };

    const reloaded = JSON.parse(new TextDecoder().decode(serializeFile(withExtra))) as { extraField: string };

    expect(reloaded.extraField).toBe("kept");
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
