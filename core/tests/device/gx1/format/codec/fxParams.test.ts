import { describe, it, expect } from "vitest";
import {
  decodeFxType, encodeFxType, decodeFxParams, encodeFxParams, fxFieldsFor,
  FX_PARAM_MAPS, FX_DELAY_TYPE_MAPS,
} from "../../../../../src/device/gx1/format/codec/fxParams";
import { bytesFromHex } from "../../../../../src/device/gx1/format/codec/primitives";
import { FX_TYPES, FX_TYPE_IDX, FX_DLY_TYPES } from "../../../../../src/device/gx1/model";
import { DEFAULT_INIT_FIXTURE, patchAt, rawBlock } from "../../helpers";

const defaultInitPatch = await patchAt(DEFAULT_INIT_FIXTURE);

// For each FX type, decode a zero byte array, re-encode the decoded params, then decode again and
// assert the two param objects are identical. Verifies every FX_PARAM_MAPS entry is internally
// consistent (decode and encode are true inverses) for all ~40 types, not just those in the fixture.
describe("FX param map symmetry (all types)", () => {
  const zeroBytes = new Array<number>(251).fill(0);

  it.each(FX_TYPES)("%s: encode(decode(zeros)) equals decode(zeros)", (fxType) => {
    const decoded = decodeFxParams(fxType, zeroBytes);

    // A type with no field map decodes to an empty bag, which re-encodes to an empty bag, so the
    // comparison below passes on exactly the regression it exists to catch.
    expect(Object.keys(decoded), `${fxType} has no field map to decode through`).not.toStrictEqual([]);

    const reencoded = encodeFxParams(fxType, decoded, zeroBytes);
    const reencodedBytes = bytesFromHex(reencoded);
    const reDecoded = decodeFxParams(fxType, reencodedBytes);

    expect(reDecoded).toStrictEqual(decoded);
  });
});

/** A 251-byte FX param block with every FX-slot DELAY sub-algorithm's fields filled in. */
const delayShadowBytes = (subType: string): number[] => {
  const DELAY_OFFSET = 212;
  const bytes = new Array<number>(251).fill(0);
  bytes[DELAY_OFFSET] = (FX_DLY_TYPES as readonly string[]).indexOf(subType);
  bytes[DELAY_OFFSET + 5] = 40;
  bytes[DELAY_OFFSET + 6] = 80;
  bytes[DELAY_OFFSET + 12] = 70;
  bytes[DELAY_OFFSET + 13] = 30;
  bytes[DELAY_OFFSET + 16] = 55;
  bytes[DELAY_OFFSET + 17] = 60;
  bytes[DELAY_OFFSET + 18] = 100;
  return bytes;
};

// The zeros symmetry test above only reaches STANDARD (type byte 0). The FX-slot DELAY is
// per-sub-algorithm, so each of the 5 sub-algorithms is exercised here with a distinct selector.
describe("FX-slot DELAY per-sub-algorithm round-trip", () => {
  it.each(FX_DLY_TYPES)("%s: decodes the selector byte as subType", (subType) => {
    const decoded = decodeFxParams("DELAY", delayShadowBytes(subType));

    expect(decoded.subType).toBe(subType);
  });

  it.each(FX_DLY_TYPES)("%s: re-encodes the block byte for byte", (subType) => {
    const bytes = delayShadowBytes(subType);
    const decoded = decodeFxParams("DELAY", bytes);

    const reencoded = bytesFromHex(encodeFxParams("DELAY", decoded, bytes));

    expect(reencoded).toStrictEqual(bytes);
  });
});

describe("decodeFxType and encodeFxType", () => {
  it("decodes an index to its type name", () => {
    expect(decodeFxType(FX_TYPE_IDX.CHORUS)).toBe("CHORUS");
  });

  it("decodes a past-end index as an UNKNOWN_FX sentinel", () => {
    expect(decodeFxType(250)).toBe("UNKNOWN_FX250");
  });

  it("encodes a type name to its index", () => {
    expect(encodeFxType("CHORUS")).toBe(FX_TYPE_IDX.CHORUS);
  });

  it("encodes a sentinel back to the index it was built from", () => {
    expect(encodeFxType(decodeFxType(250))).toBe(250);
  });

  it("throws naming an unknown type name", () => {
    const encodeUnknown = () => encodeFxType("BOGUS");

    expect(encodeUnknown).toThrow(/BOGUS/);
  });
});

describe("fxFieldsFor", () => {
  it("picks DELAY's sub-algorithm field list", () => {
    expect(fxFieldsFor("DELAY", "WARP")).toBe(FX_DELAY_TYPE_MAPS.WARP);
  });

  it("returns undefined for a DELAY sub-algorithm it has no map for", () => {
    expect(fxFieldsFor("DELAY", "BOGUS")).toBeUndefined();
  });

  it("ignores the sub-algorithm argument for any other type", () => {
    expect(fxFieldsFor("CHORUS", "WARP")).toBe(FX_PARAM_MAPS.CHORUS);
  });
});

// A type outside FX_TYPES decodes to no params rather than throwing, so a corrupt or
// newer-firmware byte doesn't fail the whole read. Encoding params for such a type is the
// opposite case: there is nowhere to put them, so it throws.
describe("Unknown FX type handling", () => {
  it("decodeFxParams reads no params off a type it does not recognize", () => {
    const bytes = new Array<number>(40).fill(7);

    const decoded = decodeFxParams("BOGUS TYPE", bytes);

    expect(decoded).toStrictEqual({});
  });

  it("encodeFxParams leaves an unrecognized type's bytes as they were read", () => {
    const originalBytes = [1, 2, 3, 4];

    const resultBytes = bytesFromHex(encodeFxParams("BOGUS TYPE", {}, originalBytes));

    expect(resultBytes).toStrictEqual(originalBytes);
  });

  it("encodeFxParams throws rather than drop params for a type with no FX_PARAM_MAPS entry", () => {
    const originalBytes = [1, 2, 3, 4];

    const encodeUnmappedType = () => encodeFxParams("BOGUS TYPE", { sustain: 50 }, originalBytes);

    expect(encodeUnmappedType).toThrow(/BOGUS TYPE/);
  });

  it("encodeFxParams throws when DELAY's sub-algorithm has no field map of its own", () => {
    const originalBytes = new Array<number>(251).fill(0);
    const staleSubType = { subType: "BOSS COMP", time: 400 };

    const encodeStaleSubType = () => encodeFxParams("DELAY", staleSubType, originalBytes);

    expect(encodeStaleSubType).toThrow(/BOSS COMP/);
  });

  it("indexTable's encode throws for a value outside its table (PITCH SHIFT's pitch field)", () => {
    const params = { mode: "MEDIUM", pitch: 999, preDelay: 0, level: 100, feedback: 0, direct: 100 };
    const bytes = new Array<number>(20).fill(0);

    const encodeWithBadPitch = () => encodeFxParams("PITCH SHIFT", params, bytes);

    expect(encodeWithBadPitch, "names the value it refused").toThrow(/999/);
    expect(encodeWithBadPitch, "and the field it refused it for").toThrow(/pitch/);
  });

  it("indexTable writes back a byte past the end of its table as it found it", () => {
    const original = new Array<number>(251).fill(0);
    original[179 + 1] = 60;
    const params = decodeFxParams("PITCH SHIFT", original);

    const encoded = encodeFxParams("PITCH SHIFT", params, original);

    expect(bytesFromHex(encoded)).toStrictEqual(original);
  });

  it("throws naming the type when the block ends before its window begins", () => {
    const decodeTruncated = () => decodeFxParams("LIMITER", new Array<number>(10).fill(0));

    expect(decodeTruncated).toThrow(/LIMITER/);
  });
});

describe("encodeFxParams writes only inside the type's own window", () => {
  it("leaves every byte outside COMPRESSOR's 4-byte window untouched", () => {
    const original = new Array<number>(251).fill(7);
    const params = { subType: "BOSS COMP", sustain: 1, attack: 2, level: 3 };

    const encoded = bytesFromHex(encodeFxParams("COMPRESSOR", params, original));

    expect(encoded.slice(4)).toStrictEqual(original.slice(4));
  });

  it("leaves a field left out of a partial params bag at its original byte", () => {
    const original = new Array<number>(251).fill(0);
    const base = 85; // FIXED WAH's window
    original[base] = 1;
    original[base + 2] = 10;
    original[base + 3] = 20;
    original[base + 4] = 30;

    const encoded = bytesFromHex(encodeFxParams("FIXED WAH", { level: 77 }, original));

    expect(encoded[base]).toBe(1);
    expect(encoded[base + 2]).toBe(77);
    expect(encoded[base + 3]).toBe(20);
    expect(encoded[base + 4]).toBe(30);
  });
});

// FIXED WAH and the FX-slot REVERB keep their sub-model selector in the param block itself
// (PARAM_SUBTYPE_EFFECTS), not FX_COM byte 2, so these prove both halves of that threading at the
// codec level: encoding the selection into the param block and decoding it back out.
describe("sub-model selectors stored in the param block", () => {
  it("round-trips FIXED WAH's subType through encode/decode", () => {
    const original = new Array<number>(251).fill(0);
    const params = { subType: "VO WAH", level: 80, direct: 20, manual: 60 };

    const encoded = bytesFromHex(encodeFxParams("FIXED WAH", params, original));
    const decoded = decodeFxParams("FIXED WAH", encoded);

    expect(decoded).toStrictEqual(params);
  });

  it("round-trips the FX-slot REVERB's subType through encode/decode", () => {
    const original = new Array<number>(251).fill(0);
    const params = { subType: "HALL M", time: 2.5, level: 40 };

    const encoded = bytesFromHex(encodeFxParams("REVERB", params, original));
    const decoded = decodeFxParams("REVERB", encoded);

    expect(decoded).toStrictEqual({ subType: "HALL M", time: 2.5, preDelay: 0, level: 40, direct: 0 });
  });
});

// default-init.tsl is a real GX-1 factory-default patch export. Every case below decodes that
// patch's own real bytes for the fx slot's actual type or, for a type that isn't the slot's active
// one, under a different type selector to reach fields the active type doesn't cover: the "shadow"
// byte range (the union region shared by all types of that slot) still holds genuine device data.
describe("Real device values (default-init.tsl)", () => {
  const patch = defaultInitPatch;
  const fx1Bytes = bytesFromHex(rawBlock(patch, "MEMORY%FX1"));
  const fx2Bytes = bytesFromHex(rawBlock(patch, "MEMORY%FX2"));
  const fx3Bytes = bytesFromHex(rawBlock(patch, "MEMORY%FX3"));
  const fx3aBytes = bytesFromHex(rawBlock(patch, "MEMORY%FX3A"));

  it.each([
    { label: "FX1 (active type: COMPRESSOR)", bytes: fx1Bytes, type: "COMPRESSOR",
      expected: { subType: "BOSS COMP", sustain: 50, attack: 50, level: 60 } },
    { label: "FX2 (active type: PARA. EQ) in real UI display order", bytes: fx2Bytes, type: "PARA. EQ",
      expected: { lowGain: 0, highGain: 0, level: 0, midFreq: "4kHz", midGain: 0, lowCut: "FLAT", highCut: "FLAT" } },
    { label: "FX3 (active type: CHORUS)", bytes: fx3Bytes, type: "CHORUS",
      expected: { subType: "MONO", rate: 50, depth: 40, level: 100, preDelay: 4 } },
  ])("decodes $label", ({ bytes, type, expected }) => {
    expect(decodeFxParams(type, bytes)).toMatchObject(expected);
  });

  it.each([
    { type: "LIMITER", expected: { subType: "BOSS", threshold: 30, ratio: 10, level: 25, attack: 50, release: 50 } },
    { type: "ENHANCER", expected: { sens: 50, low: 50, high: 50, lowFreq: "63Hz", highFreq: "2kHz", level: 100 } },
    { type: "SLICER", expected: { pattern: "PATTERN 1", rate: 50, level: 100, attack: 50, duty: 50, direct: 0 } },
    { type: "TOUCH WAH",
      expected: { filter: "BPF", polarity: "UP", sens: 50, freq: 30, reso: 70, decay: 85, level: 100, direct: 0 } },
    { type: "AUTO WAH", expected: { filter: "BPF", freq: 50, rate: 50, depth: 50, reso: 50, level: 100 } },
    { type: "DEFRETTER", expected: { sens: 50, attack: 70, depth: 0, reso: 50, tone: 0, level: 100, direct: 0 } },
    { type: "FIXED WAH", expected: { subType: "CRY WAH", level: 100, direct: 0, manual: 50 } },
    { type: "AC. GTR SIM", expected: { high: 0, body: 50, low: 0, level: 50 } },
    { type: "OD/DS",
      expected: { subType: "CLEAN BST", drive: 50, tone: 0, level: 50, direct: 0, solo: false, soloLevel: 50 } },
    { type: "FLANGER", expected: { rate: 25, depth: 60, reso: 35, manual: 55, level: 100, direct: 0 } },
    { type: "PHASER", expected: { stage: "4 STAGE", rate: 30, depth: 70, reso: 30, manual: 50, level: 100, direct: 0 } },
    { type: "VIBRATO", expected: { rate: 80, depth: 20, riseTime: 30, trigger: true, level: 100 } },
    { type: "ROTARY", expected: { speed: "SLOW", slowRate: 50, fastRate: 50, level: 100, balance: 50, drive: 0, direct: 0 } },
    { type: "PITCH SHIFT", expected: { mode: "MEDIUM", pitch: -5, preDelay: 0, level: 100, feedback: 0, direct: 100 } },
    { type: "HARMONIST", expected: { harmony: "+3rd", preDelay: 0, level: 100, feedback: 0, direct: 100 } },
    { type: "OCTAVE", expected: { minus1Oct: 50, minus2Oct: 50, direct: 100 } },
    { type: "TUNE DOWN", expected: { pitch: -2 } },
    { type: "DELAY", expected: { subType: "STANDARD", time: 400, feedback: 30, level: 50, highCut: "6.3kHz" } },
    { type: "REVERB", expected: { subType: "HALL M", time: 3, preDelay: 30, level: 30, direct: 100 } },
  ])("decodes FX1 shadow bytes for $type", ({ type, expected }) => {
    expect(decodeFxParams(type, fx1Bytes)).toStrictEqual(expected);
  });

  it("decodes FX2 shadow bytes for GEQ", () => {
    const decoded = decodeFxParams("GEQ", fx2Bytes);

    expect(decoded).toStrictEqual({
      "125Hz": 0, "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 0, level: 0,
    });
  });

  it("decodes FX3A (OVERTONE's dedicated block, not the 251-byte FX3 block) at its own offset 0", () => {
    const decoded = decodeFxParams("OVERTONE", fx3aBytes);

    expect(decoded).toStrictEqual({
      lower: 50, upper: 50, unison: 50, direct: 100, detune: 35,
    });
  });
});
