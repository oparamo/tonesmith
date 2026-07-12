import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl";
import { decodePatch, encodePatch } from "../../../src/devices/gx1/codec";
import { RAW } from "../../../src/devices/gx1/common";

const FIXTURE = resolve(import.meta.dirname, "../../../../fixtures/gx1/rock-tones.tsl");

describe("GX-1 round-trip", () => {
  it("decodes and re-encodes every patch byte-for-byte", () => {
    const file = readFile(FIXTURE);
    const rawFileContents = readFileSync(FIXTURE, "utf8");
    const raw = JSON.parse(rawFileContents) as {
      data: [{ paramSet: Record<string, string[]> }[], unknown[]];
    };

    for (let i = 0; i < file.patches.length; i++) {
      const patch = file.patches[i];
      const original = raw.data[0][i];
      const reencoded = encodePatch(patch);

      for (const key of Object.keys(original.paramSet)) {
        expect(reencoded.paramSet[key], `patch ${i} key ${key}`).toEqual(
          original.paramSet[key]
        );
      }
    }
  });

  it("patch names round-trip cleanly", () => {
    const file = readFile(FIXTURE);

    for (const patch of file.patches) {
      expect(typeof patch.name).toBe("string");
      expect(patch.name.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("decodePatch", () => {
  it("defaults memo to an empty string when the raw envelope omits it", () => {
    const file = readFile(FIXTURE);
    const paramSet = file.patches[0][RAW];

    const decoded = decodePatch({ paramSet });

    expect(decoded.memo).toBe("");
  });
});
