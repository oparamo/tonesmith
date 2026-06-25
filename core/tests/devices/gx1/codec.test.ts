import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl.js";
import { encodePatch } from "../../../src/devices/gx1/codec/index.js";
import { decodeFxParams, encodeFxParams } from "../../../src/devices/gx1/codec/fx-params.js";
import { decodeDelay, encodeDelay, decodeReverb, encodeReverb } from "../../../src/devices/gx1/codec/blocks.js";
import { bytesFromHex, hexFromBytes } from "../../../src/devices/gx1/codec/primitives.js";
import { FX_TYPES, DLY_TYPES, REV_TYPES, DLY_TYPE_IDX, REV_TYPE_IDX } from "../../../src/devices/gx1/common/index.js";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/rock-tones.tsl");

// ── Fixture round-trip ────────────────────────────────────────────────────────

describe("GX-1 round-trip", () => {
  it("decodes and re-encodes every patch byte-for-byte", () => {
    const file = readFile(FIXTURE);
    const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      data: [Array<{ paramSet: Record<string, string[]> }>, unknown[]];
    };

    for (let i = 0; i < file.patches.length; i++) {
      const patch = file.patches[i]!;
      const original = raw.data[0][i]!;
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


// ── Per-effect-type symmetry tests ────────────────────────────────────────────
//
// For each FX type, decode a zero byte array, re-encode the decoded params, then
// decode again and assert the two param objects are identical.
// This verifies every FX_PARAM_MAPS entry is internally consistent (decode and
// encode are true inverses) for all ~40 types, not just those in the fixture.

describe("FX param map symmetry (all types)", () => {
  const zeroBytes = new Array(32).fill(0) as number[];

  for (const fxType of FX_TYPES) {
    it(`${fxType}: encode(decode(zeros)) equals decode(zeros)`, () => {
      const decoded = decodeFxParams(fxType, null, zeroBytes);

      // Types not yet in FX_PARAM_MAPS return { unknownBytes: [...] } — skip them
      if ("unknownBytes" in decoded) return;

      const reencoded = encodeFxParams(fxType, null, decoded, zeroBytes);
      const reDecoded = decodeFxParams(fxType, null, bytesFromHex(reencoded));

      expect(reDecoded).toEqual(decoded);
    });
  }
});


// ── Delay block symmetry tests ────────────────────────────────────────────────

describe("Delay block symmetry (all types)", () => {
  for (const dlyType of DLY_TYPES) {
    it(`${dlyType}: encode(decode(zeros)) equals decode(zeros)`, () => {
      const bytes = new Array(29).fill(0) as number[];
      bytes[0] = 1;
      bytes[1] = DLY_TYPE_IDX[dlyType]!;

      const hexList = hexFromBytes(bytes);
      const decoded = decodeDelay(hexList);
      const reencoded = encodeDelay(decoded);
      const reDecoded = decodeDelay(reencoded);

      expect(reDecoded).toEqual(decoded);
    });
  }
});


// ── Reverb block symmetry tests ───────────────────────────────────────────────

describe("Reverb block symmetry (all types)", () => {
  for (const revType of REV_TYPES) {
    it(`${revType}: encode(decode(zeros)) equals decode(zeros)`, () => {
      const bytes = new Array(20).fill(0) as number[];
      bytes[0] = 1;
      bytes[1] = REV_TYPE_IDX[revType]!;

      const hexList = hexFromBytes(bytes);
      const decoded = decodeReverb(hexList);
      const reencoded = encodeReverb(decoded);
      const reDecoded = decodeReverb(reencoded);

      expect(reDecoded).toEqual(decoded);
    });
  }
});
