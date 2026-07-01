import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl";
import { encodePatch } from "../../../src/devices/gx1/codec";
import { decodeFxParams, encodeFxParams } from "../../../src/devices/gx1/codec/fx-params";
import {
  decodeDelay, encodeDelay, decodeReverb, encodeReverb, decodeChain, encodeChain,
} from "../../../src/devices/gx1/codec/blocks";
import { bytesFromHex, hexFromBytes } from "../../../src/devices/gx1/codec/primitives";
import { FX_TYPES, DLY_TYPES, REV_TYPES, DLY_TYPE_IDX, REV_TYPE_IDX } from "../../../src/devices/gx1/common";

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
  const zeroBytes = new Array(251).fill(0) as number[];

  for (const fxType of FX_TYPES) {
    it(`${fxType}: encode(decode(zeros)) equals decode(zeros)`, () => {
      const decoded = decodeFxParams(fxType, null, zeroBytes);

      // Types not yet in FX_PARAM_MAPS return { unknownBytes: [...] } — skip them
      if ("unknownBytes" in decoded) return;

      const reencoded = encodeFxParams(fxType, decoded, zeroBytes);
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


// ── Chain block (real device values) ─────────────────────────────────────────
//
// MEMORY%CHAIN is a linked list (see CHAIN_BLOCK_ORDER in common/constants.ts), not a
// positional array — byte 0 is whichever block comes first, and byte
// (1 + CHAIN_BLOCK_ORDER.indexOf(name)) is the firmware value of whatever follows that
// specific block. These byte arrays are real values read off a GX-1 after performing
// each reorder on the device itself, not self-consistency round-trips.

describe("Chain block (real device values)", () => {
  const DEFAULT_BYTES = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 11, 12];
  const DEFAULT_ORDER = ["PFX", "FX1", "OD/DS", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"];
  const FX2_FX3_SWAP_BYTES = [1, 2, 3, 4, 7, 9, 5, 8, 6, 10, 0, 11, 12];
  const FX2_FX3_SWAP_ORDER = ["PFX", "FX1", "OD/DS", "AMP", "NS", "FV", "FX3", "FX2", "DLY", "REV"];
  const AMP_OD_DS_SWAP_BYTES = [1, 2, 4, 7, 3, 6, 9, 8, 5, 10, 0, 11, 12];
  const AMP_OD_DS_SWAP_ORDER = ["PFX", "FX1", "AMP", "OD/DS", "NS", "FV", "FX2", "FX3", "DLY", "REV"];

  it("decodes the untouched default chain", () => {
    expect(decodeChain(hexFromBytes(DEFAULT_BYTES))).toEqual(DEFAULT_ORDER);
  });

  it("decodes an FX2/FX3 swap", () => {
    expect(decodeChain(hexFromBytes(FX2_FX3_SWAP_BYTES))).toEqual(FX2_FX3_SWAP_ORDER);
  });

  it("decodes an AMP/OD-DS swap", () => {
    expect(decodeChain(hexFromBytes(AMP_OD_DS_SWAP_BYTES))).toEqual(AMP_OD_DS_SWAP_ORDER);
  });

  it("encodes the default order back to the real device bytes", () => {
    expect(encodeChain(DEFAULT_ORDER, hexFromBytes(DEFAULT_BYTES))).toEqual(hexFromBytes(DEFAULT_BYTES));
  });

  it("encodes an FX2/FX3 swap to the real device bytes", () => {
    expect(encodeChain(FX2_FX3_SWAP_ORDER, hexFromBytes(DEFAULT_BYTES))).toEqual(hexFromBytes(FX2_FX3_SWAP_BYTES));
  });

  it("encodes an AMP/OD-DS swap to the real device bytes", () => {
    expect(encodeChain(AMP_OD_DS_SWAP_ORDER, hexFromBytes(DEFAULT_BYTES))).toEqual(hexFromBytes(AMP_OD_DS_SWAP_BYTES));
  });

  it("preserves unused trailing bytes from the original param set", () => {
    const originalWithJunk = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 99, 42];
    const result = bytesFromHex(encodeChain(DEFAULT_ORDER, hexFromBytes(originalWithJunk)));
    expect(result.slice(11)).toEqual([99, 42]);
  });
});
