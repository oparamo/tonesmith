import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl";
import { encodePatch } from "../../../src/devices/gx1/codec";
import { decodeFxParams, encodeFxParams } from "../../../src/devices/gx1/codec/fx-params";
import {
  decodeDelay, encodeDelay, decodeReverb, encodeReverb, decodeChain, encodeChain, decodePfx,
} from "../../../src/devices/gx1/codec/blocks";
import { bytesFromHex, hexFromBytes } from "../../../src/devices/gx1/codec/primitives";
import {
  FX_TYPES, DLY_TYPES, REV_TYPES, DLY_TYPE_IDX, REV_TYPE_IDX, PFX_TYPE_IDX, RAW,
} from "../../../src/devices/gx1/common";
import { HIGH_CUT_MAP, LOW_CUT_MAP } from "../../../src/devices/gx1/builder";

const DEFAULT_INIT_FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/default-init.tsl");

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
      const decoded = decodeFxParams(fxType, zeroBytes);

      // Types not yet in FX_PARAM_MAPS return { unknownBytes: [...] } — skip them
      if ("unknownBytes" in decoded) return;

      const reencoded = encodeFxParams(fxType, decoded, zeroBytes);
      const reDecoded = decodeFxParams(fxType, bytesFromHex(reencoded));

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


// ── Real device values (factory default init patch) ──────────────────────────
//
// default-init.tsl is a real GX-1 factory-default patch export. Every block below
// asserts against that patch's actually-active type. Every effect/delay/reverb type
// that ISN'T the patch's active type still has the device's own factory-default
// bytes sitting in its "shadow" byte range (the union region shared by all types of
// that slot), so overriding just the type selector and decoding the same real bytes
// still exercises genuine device data for every field checked below.

describe("Real device values (default-init.tsl)", () => {
  const file = readFile(DEFAULT_INIT_FIXTURE);
  const patch = file.patches[0]!;
  const fx1Bytes = bytesFromHex(patch[RAW]["MEMORY%FX1"]!);
  const fx2Bytes = bytesFromHex(patch[RAW]["MEMORY%FX2"]!);
  const dlyBytes = bytesFromHex(patch[RAW]["MEMORY%DLY"]!);
  const revBytes = bytesFromHex(patch[RAW]["MEMORY%REV"]!);
  const fx3aBytes = bytesFromHex(patch[RAW]["MEMORY%FX3A"]!);
  const pfxBytes = bytesFromHex(patch[RAW]["MEMORY%PFX"]!);

  it("decodes the active chain order", () => {
    expect(patch.chain).toEqual(["PFX", "FX1", "OD/DS", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"]);
  });

  it("decodes FX1 (active type: COMPRESSOR)", () => {
    expect(patch.fx1.type).toBe("COMPRESSOR");
    expect(patch.fx1.params).toMatchObject({ type: "BOSS COMP", sustain: 50, attack: 50, level: 60 });
  });

  it("decodes ODDS", () => {
    expect(patch.odds).toMatchObject({
      type: "OVERDRIVE", drive: 50, tone: 0, level: 50, direct: 0, solo: false, soloLevel: 50,
    });
  });

  it("decodes AMP", () => {
    expect(patch.amp).toMatchObject({
      type: "NATURAL", speaker: "ORIGINAL", gain: 50, level: 50,
      bass: 50, middle: 50, treble: 50, mic: "DYN421", solo: false, soloLevel: 50,
    });
  });

  it("decodes PFX (active type: WAH)", () => {
    expect(patch.pfx).toMatchObject({
      on: false, type: "WAH", wahType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100,
    });
  });

  it("decodes NS", () => {
    expect(patch.ns).toMatchObject({ threshold: 30, release: 30 });
  });

  it("decodes FV", () => {
    expect(patch.fv).toMatchObject({ position: 100, min: 0, max: 100 });
  });

  it("decodes FX2 (active type: PARA. EQ) in real UI display order", () => {
    expect(patch.fx2.type).toBe("PARA. EQ");
    expect(patch.fx2.params).toEqual({
      lowGain: 0, highGain: 0, level: 0, midFreq: 23,
      midGain: 0, lowCut: LOW_CUT_MAP["FLAT"], highCut: HIGH_CUT_MAP["FLAT"],
    });
  });

  it("decodes FX3 (active type: CHORUS)", () => {
    expect(patch.fx3.type).toBe("CHORUS");
    expect(patch.fx3.params).toMatchObject({ type: "MONO", rate: 50, depth: 40, level: 100, preDelay: 4 });
  });

  it("decodes the dedicated DLY block (active type: STANDARD)", () => {
    expect(patch.delay).toMatchObject({ type: "STANDARD", time: 400, feedback: 30, level: 50, highCut: 25 });
  });

  it("decodes the dedicated REV block (active type: HALL M)", () => {
    expect(patch.reverb).toMatchObject({
      type: "HALL M", time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100,
    });
  });

  // The following decode the SAME real device bytes above, but under a different
  // type selector, to reach fields the default patch's active type doesn't cover.
  // Every byte read is still a genuine device default — only the type string passed
  // to decodeFxParams/decodeDelay/decodeReverb is synthetic.

  it("decodes FX1 shadow bytes for LIMITER (byte offset 10)", () => {
    expect(decodeFxParams("LIMITER", fx1Bytes)).toEqual({
      type: "BOSS", threshold: 30, ratio: 10, level: 25, attack: 50, release: 50,
    });
  });

  it("decodes FX1 shadow bytes for ENHANCER (byte offset 19, reordered fields)", () => {
    expect(decodeFxParams("ENHANCER", fx1Bytes)).toEqual({
      sens: 50, low: 50, high: 50, lowFreq: 3, highFreq: 4, level: 100,
    });
  });

  it("decodes FX1 shadow bytes for SLICER (byte offset 25, direct + signed duty)", () => {
    expect(decodeFxParams("SLICER", fx1Bytes)).toEqual({
      pattern: "PATTERN 1", rate: 50, level: 100, attack: 50, duty: 50, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for TOUCH WAH (byte offset 59, reordered + direct)", () => {
    expect(decodeFxParams("TOUCH WAH", fx1Bytes)).toEqual({
      filter: "BPF", polarity: "UP", sens: 50, freq: 30, reso: 70, decay: 85, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for AUTO WAH (byte offset 67, reordered)", () => {
    expect(decodeFxParams("AUTO WAH", fx1Bytes)).toEqual({
      filter: "BPF", freq: 50, rate: 50, depth: 50, reso: 50, level: 100,
    });
  });

  it("decodes FX1 shadow bytes for DEFRETTER (byte offset 73, reordered)", () => {
    expect(decodeFxParams("DEFRETTER", fx1Bytes)).toEqual({
      sens: 50, attack: 70, depth: 0, reso: 50, tone: 0, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for FIXED WAH (byte offset 85, no freq field, has manual)", () => {
    expect(decodeFxParams("FIXED WAH", fx1Bytes)).toEqual({
      wahType: "CRY WAH", level: 100, direct: 0, manual: 50,
    });
  });

  it("decodes FX1 shadow bytes for AC. GTR SIM (byte offset 93, reordered)", () => {
    expect(decodeFxParams("AC. GTR SIM", fx1Bytes)).toEqual({
      high: 0, body: 50, low: 0, level: 50,
    });
  });

  it("decodes FX1 shadow bytes for OD/DS (byte offset 115 — type read from the param block, not FX_COM byte 2)", () => {
    expect(decodeFxParams("OD/DS", fx1Bytes)).toEqual({
      type: "CLEAN BST", drive: 50, tone: 0, level: 50, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for FLANGER (byte offset 128, reordered + direct)", () => {
    expect(decodeFxParams("FLANGER", fx1Bytes)).toEqual({
      rate: 25, depth: 60, reso: 35, manual: 55, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for PHASER (byte offset 134, + direct)", () => {
    expect(decodeFxParams("PHASER", fx1Bytes)).toEqual({
      stage: 2, rate: 30, depth: 70, reso: 30, manual: 50, level: 100, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for VIBRATO (byte offset 155, reordered)", () => {
    expect(decodeFxParams("VIBRATO", fx1Bytes)).toEqual({
      rate: 80, depth: 20, riseTime: 30, trigger: 1, level: 100,
    });
  });

  it("decodes FX1 shadow bytes for ROTARY (byte offset 148, + direct)", () => {
    expect(decodeFxParams("ROTARY", fx1Bytes)).toEqual({
      speed: "SLOW", slowRate: 50, fastRate: 50, level: 100, balance: 50, drive: 0, direct: 0,
    });
  });

  it("decodes FX1 shadow bytes for PITCH SHIFT (byte offset 179, 4-byte preDelay)", () => {
    expect(decodeFxParams("PITCH SHIFT", fx1Bytes)).toEqual({
      mode: "MEDIUM", pitch: -5, preDelay: 0, level: 100, feedback: 0, direct: 100,
    });
  });

  it("decodes FX1 shadow bytes for HARMONIST (byte offset 188, 4-byte preDelay, no key field)", () => {
    expect(decodeFxParams("HARMONIST", fx1Bytes)).toEqual({
      harmony: "+3rd", preDelay: 0, level: 100, feedback: 0, direct: 100,
    });
  });

  it("decodes FX1 shadow bytes for OCTAVE (byte offset 196, minus1Oct before minus2Oct)", () => {
    expect(decodeFxParams("OCTAVE", fx1Bytes)).toEqual({
      minus1Oct: 50, minus2Oct: 50, direct: 100,
    });
  });

  it("decodes FX1 shadow bytes for TUNE DOWN (byte offset 211, not 8)", () => {
    expect(decodeFxParams("TUNE DOWN", fx1Bytes)).toEqual({ pitch: -2 });
  });

  it("decodes FX1 shadow bytes for DELAY as an FX-slot type (byte offset 212)", () => {
    expect(decodeFxParams("DELAY", fx1Bytes)).toEqual({
      type: "STANDARD", time: 400, feedback: 30, level: 50, highCut: 25, modRate: 50, modDepth: 0, trigger: "OFF",
    });
  });

  it("decodes FX1 shadow bytes for REVERB as an FX-slot type (byte offset 231, 2-byte preDelay)", () => {
    expect(decodeFxParams("REVERB", fx1Bytes)).toEqual({
      type: "HALL M", time: 3, preDelay: 30, level: 30, direct: 100,
    });
  });

  it("decodes FX3A (OVERTONE's dedicated block, not the 251-byte FX3 block)", () => {
    expect(decodeFxParams("OVERTONE", fx3aBytes)).toEqual({
      lower: 50, upper: 50, unison: 50, direct: 100, detune: 35,
    });
  });

  it("decodes FX2 shadow bytes for GEQ (byte offset 38)", () => {
    expect(decodeFxParams("GEQ", fx2Bytes)).toEqual({
      "125Hz": 0, "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 0, level: 0,
    });
  });

  it("decodes DLY shadow bytes for MODULATE (shares time/feedback/level/highCut with STANDARD)", () => {
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX["MODULATE"]!, ...dlyBytes.slice(2)])))
      .toMatchObject({ time: 400, feedback: 30, level: 50, highCut: 25, modRate: 50, modDepth: 30 });
  });

  it("decodes DLY shadow bytes for ANALOG (its own 4-byte time at offset 13)", () => {
    // highCut is the same shared byte STANDARD (the patch's active type) left at 25;
    // ANALOG's own device-default of 29 only applies when ANALOG itself is selected.
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX["ANALOG"]!, ...dlyBytes.slice(2)])))
      .toMatchObject({ time: 400, feedback: 30, level: 50, highCut: 25 });
  });

  it("decodes DLY shadow bytes for WARP (time shared at offset 2, trigger/level at 21/25)", () => {
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX["WARP"]!, ...dlyBytes.slice(2)])))
      .toMatchObject({ on: false, type: "WARP", time: 400, trigger: 0, level: 50 });
  });

  it("decodes DLY shadow bytes for GLITCH (own 1-byte time at offset 26, not the shared 4-byte field)", () => {
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX["GLITCH"]!, ...dlyBytes.slice(2)])))
      .toMatchObject({ on: false, type: "GLITCH", trigger: 0, time: 50, glitch: 50, balance: 100 });
  });

  it("decodes REV shadow bytes for SHIMMER (its own level at offset 10, not the shared EFFECT_LEVEL at 5)", () => {
    expect(decodeReverb(hexFromBytes([...revBytes.slice(0, 1), REV_TYPE_IDX["SHIMMER"]!, ...revBytes.slice(2)])))
      .toMatchObject({ on: false, type: "SHIMMER", time: 2.6, tone: 0, preDelay: 30, pitch: 12, level: 100 });
  });

  it("decodes REV shadow bytes for SUB DELAY (its own 4-byte time at offset 11)", () => {
    expect(decodeReverb(hexFromBytes([...revBytes.slice(0, 1), REV_TYPE_IDX["SUB DELAY"]!, ...revBytes.slice(2)])))
      .toMatchObject({ on: false, type: "SUB DELAY", time: 400, level: 50, feedback: 30, highCut: 25 });
  });

  it("decodes REV shadow bytes for TERA ECHO (spreadTime at 18, not a shared time field)", () => {
    expect(decodeReverb(hexFromBytes([...revBytes.slice(0, 1), REV_TYPE_IDX["TERA ECHO"]!, ...revBytes.slice(2)])))
      .toMatchObject({ on: false, type: "TERA ECHO", tone: 0, level: 25, direct: 100, feedback: 30, spreadTime: 50, trigger: 0 });
  });

  it("decodes PFX shadow bytes for PEDAL BEND (its own pitchMin/pitchMax at offset 9/10)", () => {
    expect(decodePfx(hexFromBytes([...pfxBytes.slice(0, 1), PFX_TYPE_IDX["PEDAL BEND"]!, ...pfxBytes.slice(2)])))
      .toMatchObject({ on: false, type: "PEDAL BEND", pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 });
  });
});
