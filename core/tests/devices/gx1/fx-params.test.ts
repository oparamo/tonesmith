import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl";
import { decodeFxParams, encodeFxParams } from "../../../src/devices/gx1/codec/fx-params";
import { bytesFromHex } from "../../../src/devices/gx1/codec/primitives";
import { FX_TYPES, RAW } from "../../../src/devices/gx1/common";
const DEFAULT_INIT_FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/default-init.tsl");

// ── Per-effect-type symmetry tests ────────────────────────────────────────────
//
// For each FX type, decode a zero byte array, re-encode the decoded params, then
// decode again and assert the two param objects are identical.
// This verifies every FX_PARAM_MAPS entry is internally consistent (decode and
// encode are true inverses) for all ~40 types, not just those in the fixture.

describe("FX param map symmetry (all types)", () => {
  const zeroBytes = new Array<number>(251).fill(0);

  for (const fxType of FX_TYPES) {
    it(`${fxType}: encode(decode(zeros)) equals decode(zeros)`, () => {
      const decoded = decodeFxParams(fxType, zeroBytes);

      // Types not yet in FX_PARAM_MAPS return { unknownBytes: [...] } — skip them
      if ("unknownBytes" in decoded) return;

      const reencoded = encodeFxParams(fxType, decoded, zeroBytes);
      const reencodedBytes = bytesFromHex(reencoded);
      const reDecoded = decodeFxParams(fxType, reencodedBytes);

      expect(reDecoded).toEqual(decoded);
    });
  }
});


// ── Unknown/invalid type handling ─────────────────────────────────────────────
//
// FX_PARAM_MAPS is a Partial<Record<string, FieldCodec[]>> — types outside the known
// FX_TYPES list (or not-yet-mapped ones) fall through gracefully rather than throwing,
// so a corrupt or newer-firmware byte doesn't crash the whole decode.

describe("Unknown FX type handling", () => {
  it("decodeFxParams returns unknownBytes for a type with no FX_PARAM_MAPS entry", () => {
    const bytes = new Array<number>(40).fill(7);

    const decoded = decodeFxParams("BOGUS TYPE", bytes);

    expect(decoded).toEqual({ unknownBytes: bytes.slice(0, 32) });
  });

  it("encodeFxParams returns the original bytes unchanged when params has unknownBytes", () => {
    const originalBytes = [1, 2, 3, 4];

    const result = encodeFxParams("COMPRESSOR", { unknownBytes: originalBytes }, originalBytes);
    const resultBytes = bytesFromHex(result);

    expect(resultBytes).toEqual(originalBytes);
  });

  it("encodeFxParams leaves bytes unchanged for a type with no FX_PARAM_MAPS entry", () => {
    const originalBytes = [1, 2, 3, 4];

    const result = encodeFxParams("BOGUS TYPE", { sustain: 50 }, originalBytes);
    const resultBytes = bytesFromHex(result);

    expect(resultBytes).toEqual(originalBytes);
  });

  it("indexTable's encode throws for a value outside its table (PITCH SHIFT's pitch field)", () => {
    const params = { mode: "MEDIUM", pitch: 999, preDelay: 0, level: 100, feedback: 0, direct: 100 };
    const bytes = new Array<number>(20).fill(0);

    const encodeWithBadPitch = () => encodeFxParams("PITCH SHIFT", params, bytes);

    expect(encodeWithBadPitch).toThrow('Unknown pitch value: 999');
  });
});


// ── Real device values (factory default init patch) ──────────────────────────
//
// default-init.tsl is a real GX-1 factory-default patch export. Every block below
// asserts against that patch's actually-active type. Every effect type that ISN'T
// the patch's active type still has the device's own factory-default bytes sitting
// in its "shadow" byte range (the union region shared by all types of that slot),
// so overriding just the type selector and decoding the same real bytes still
// exercises genuine device data for every field checked below.

describe("Real device values (default-init.tsl)", () => {
  const file = readFile(DEFAULT_INIT_FIXTURE);
  const patch = file.patches[0];
  const fx1Bytes = bytesFromHex(patch[RAW]["MEMORY%FX1"]);
  const fx2Bytes = bytesFromHex(patch[RAW]["MEMORY%FX2"]);
  const fx3aBytes = bytesFromHex(patch[RAW]["MEMORY%FX3A"]);

  it("decodes FX1 (active type: COMPRESSOR)", () => {
    expect(patch.fx1.type).toBe("COMPRESSOR");
    expect(patch.fx1.params).toMatchObject({ type: "BOSS COMP", sustain: 50, attack: 50, level: 60 });
  });

  it("decodes FX2 (active type: PARA. EQ) in real UI display order", () => {
    expect(patch.fx2.type).toBe("PARA. EQ");
    expect(patch.fx2.params).toEqual({
      lowGain: 0, highGain: 0, level: 0, midFreq: "4kHz",
      midGain: 0, lowCut: "FLAT", highCut: "FLAT",
    });
  });

  it("decodes FX3 (active type: CHORUS)", () => {
    expect(patch.fx3.type).toBe("CHORUS");
    expect(patch.fx3.params).toMatchObject({ type: "MONO", rate: 50, depth: 40, level: 100, preDelay: 4 });
  });

  // The following decode the SAME real device bytes above, but under a different
  // type selector, to reach fields the default patch's active type doesn't cover.
  // Every byte read is still a genuine device default — only the type string passed
  // to decodeFxParams is synthetic.

  it("decodes FX1 shadow bytes for LIMITER (byte offset 10)", () => {
    const decoded = decodeFxParams("LIMITER", fx1Bytes);

    expect(decoded).toEqual({
      type: "BOSS", threshold: 30, ratio: 10, level: 25, attack: 50, release: 50,
    });
  });

  it("decodes FX1 shadow bytes for ENHANCER (byte offset 19, reordered fields)", () => {
    const decoded = decodeFxParams("ENHANCER", fx1Bytes);

    expect(decoded).toEqual({
      sens: 50, low: 50, high: 50, lowFreq: "63Hz", highFreq: "2kHz", level: 100,
    });
  });

  it("decodes FX1 shadow bytes for SLICER (byte offset 25, direct + signed duty)", () => {
    const decoded = decodeFxParams("SLICER", fx1Bytes);

    expect(decoded).toEqual({
      pattern: "PATTERN 1", rate: 50, level: 100, attack: 50, duty: 50, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for TOUCH WAH (byte offset 59, reordered + direct)", () => {
    const decoded = decodeFxParams("TOUCH WAH", fx1Bytes);

    expect(decoded).toEqual({
      filter: "BPF", polarity: "UP", sens: 50, freq: 30, reso: 70, decay: 85, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for AUTO WAH (byte offset 67, reordered)", () => {
    const decoded = decodeFxParams("AUTO WAH", fx1Bytes);

    expect(decoded).toEqual({
      filter: "BPF", freq: 50, rate: 50, depth: 50, reso: 50, level: 100,
    });
  });

  it("decodes FX1 shadow bytes for DEFRETTER (byte offset 73, reordered)", () => {
    const decoded = decodeFxParams("DEFRETTER", fx1Bytes);

    expect(decoded).toEqual({
      sens: 50, attack: 70, depth: 0, reso: 50, tone: 0, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for FIXED WAH (byte offset 85, no freq field, has manual)", () => {
    const decoded = decodeFxParams("FIXED WAH", fx1Bytes);

    expect(decoded).toEqual({
      type: "CRY WAH", level: 100, direct: 0, manual: 50,
    });
  });

  it("decodes FX1 shadow bytes for AC. GTR SIM (byte offset 93, reordered)", () => {
    const decoded = decodeFxParams("AC. GTR SIM", fx1Bytes);

    expect(decoded).toEqual({
      high: 0, body: 50, low: 0, level: 50,
    });
  });

  it("decodes FX1 shadow bytes for OD/DS (byte offset 115 — type read from the param block, not FX_COM byte 2)", () => {
    const decoded = decodeFxParams("OD/DS", fx1Bytes);

    expect(decoded).toEqual({
      type: "CLEAN BST", drive: 50, tone: 0, level: 50, direct: 0, solo: 0, soloLevel: 50,
    });
  });

  it("decodes FX1 shadow bytes for FLANGER (byte offset 128, reordered + direct)", () => {
    const decoded = decodeFxParams("FLANGER", fx1Bytes);

    expect(decoded).toEqual({
      rate: 25, depth: 60, reso: 35, manual: 55, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for PHASER (byte offset 134, + direct)", () => {
    const decoded = decodeFxParams("PHASER", fx1Bytes);

    expect(decoded).toEqual({
      stage: 2, rate: 30, depth: 70, reso: 30, manual: 50, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for VIBRATO (byte offset 155, reordered)", () => {
    const decoded = decodeFxParams("VIBRATO", fx1Bytes);

    expect(decoded).toEqual({
      rate: 80, depth: 20, riseTime: 30, trigger: 1, level: 100,
    });
  });

  it("decodes FX1 shadow bytes for ROTARY (byte offset 148, + direct)", () => {
    const decoded = decodeFxParams("ROTARY", fx1Bytes);

    expect(decoded).toEqual({
      speed: "SLOW", slowRate: 50, fastRate: 50, level: 100, balance: 50, drive: 0, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for PITCH SHIFT (byte offset 179, 4-byte preDelay)", () => {
    const decoded = decodeFxParams("PITCH SHIFT", fx1Bytes);

    expect(decoded).toEqual({
      mode: "MEDIUM", pitch: -5, preDelay: 0, level: 100, feedback: 0, direct: 100,
    });
  });

  it("decodes FX1 shadow bytes for HARMONIST (byte offset 188, 4-byte preDelay, no key field)", () => {
    const decoded = decodeFxParams("HARMONIST", fx1Bytes);

    expect(decoded).toEqual({
      harmony: "+3rd", preDelay: 0, level: 100, feedback: 0, direct: 100,
    });
  });

  it("decodes FX1 shadow bytes for OCTAVE (byte offset 196, minus1Oct before minus2Oct)", () => {
    const decoded = decodeFxParams("OCTAVE", fx1Bytes);

    expect(decoded).toEqual({
      minus1Oct: 50, minus2Oct: 50, direct: 100,
    });
  });

  it("decodes FX1 shadow bytes for TUNE DOWN (byte offset 211, not 8)", () => {
    const decoded = decodeFxParams("TUNE DOWN", fx1Bytes);

    expect(decoded).toEqual({ pitch: -2 });
  });

  it("decodes FX1 shadow bytes for DELAY as an FX-slot type (byte offset 212)", () => {
    const decoded = decodeFxParams("DELAY", fx1Bytes);

    expect(decoded).toEqual({
      type: "STANDARD", time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 50, modDepth: 0, trigger: "OFF",
    });
  });

  it("decodes FX1 shadow bytes for REVERB as an FX-slot type (byte offset 231, 2-byte preDelay)", () => {
    const decoded = decodeFxParams("REVERB", fx1Bytes);

    expect(decoded).toEqual({
      type: "HALL M", time: 3, preDelay: 30, level: 30, direct: 100,
    });
  });

  it("decodes FX3A (OVERTONE's dedicated block, not the 251-byte FX3 block)", () => {
    const decoded = decodeFxParams("OVERTONE", fx3aBytes);

    expect(decoded).toEqual({
      lower: 50, upper: 50, unison: 50, direct: 100, detune: 35,
    });
  });

  it("decodes FX2 shadow bytes for GEQ (byte offset 38)", () => {
    const decoded = decodeFxParams("GEQ", fx2Bytes);

    expect(decoded).toEqual({
      "125Hz": 0, "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 0, level: 0,
    });
  });
});
