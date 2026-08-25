import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readFile } from "../../../src/devices/gx1/tsl";
import { decodePatch, encodePatch } from "../../../src/devices/gx1/codec";
import { RAW } from "../../../src/devices/gx1/common";
import { ROCK_TONES_FIXTURE as FIXTURE, present } from "../../helpers";

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
  original: present(raw.data[0][index], `raw patch ${index}`),
}));

describe("GX-1 round-trip", () => {
  it.each(patchCases)("decodes and re-encodes patch $index byte-for-byte", ({ patch, index, original }) => {
    const reencoded = encodePatch(patch);

    // The loop below walks the original's keys, so a block the encoder invented would pass it.
    expect(Object.keys(reencoded.paramSet).sort(), `patch ${index} block set`)
      .toEqual(Object.keys(original.paramSet).sort());

    for (const key of Object.keys(original.paramSet)) {
      expect(reencoded.paramSet[key], `patch ${index} key ${key}`).toEqual(original.paramSet[key]);
    }
  });
});

describe("decodePatch", () => {
  it("defaults memo to an empty string when the raw envelope omits it", () => {
    const paramSet = present(file.patches[0], "patch 0 of the fixture")[RAW];

    const decoded = decodePatch({ paramSet });

    expect(decoded.memo).toBe("");
  });
});
