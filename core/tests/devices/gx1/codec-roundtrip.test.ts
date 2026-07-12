import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl";
import { decodePatch, encodePatch } from "../../../src/devices/gx1/codec";
import { RAW } from "../../../src/devices/gx1/common";

const FIXTURE = resolve(import.meta.dirname, "../../../../fixtures/gx1/rock-tones.tsl");

const file = readFile(FIXTURE);
const rawFileContents = readFileSync(FIXTURE, "utf8");
const raw = JSON.parse(rawFileContents) as {
  data: [{ paramSet: Record<string, string[]> }[], unknown[]];
};

type GxPatch = (typeof file.patches)[number];

interface PatchCase {
  index: number;
  patch: GxPatch;
  original: { paramSet: Record<string, string[]> };
}

const patchCases: PatchCase[] = file.patches.map((patch, index) => ({
  index,
  patch,
  original: raw.data[0][index],
}));

describe("GX-1 round-trip", () => {
  it.each(patchCases)("decodes and re-encodes patch $index byte-for-byte", ({ patch, index, original }) => {
    const reencoded = encodePatch(patch);

    for (const key of Object.keys(original.paramSet)) {
      expect(reencoded.paramSet[key], `patch ${index} key ${key}`).toEqual(original.paramSet[key]);
    }
  });

  it("patch names round-trip cleanly", () => {
    for (const patch of file.patches) {
      expect(typeof patch.name).toBe("string");
      expect(patch.name.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("decodePatch", () => {
  it("defaults memo to an empty string when the raw envelope omits it", () => {
    const paramSet = file.patches[0][RAW];

    const decoded = decodePatch({ paramSet });

    expect(decoded.memo).toBe("");
  });
});
