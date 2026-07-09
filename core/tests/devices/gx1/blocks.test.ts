import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl";
import {
  decodeDelay, encodeDelay, decodeReverb, encodeReverb, decodeChain, encodeChain, decodePfx,
  decodeKey, encodeKey, decodeNs, encodeNs, decodeFv, encodeFv,
} from "../../../src/devices/gx1/codec/blocks";
import { bytesFromHex, hexFromBytes } from "../../../src/devices/gx1/codec/primitives";
import {
  DLY_TYPES, REV_TYPES, DLY_TYPE_IDX, REV_TYPE_IDX, PFX_TYPE_IDX, RAW,
} from "../../../src/devices/gx1/common";

const DEFAULT_INIT_FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/default-init.tsl");

// ── Delay block symmetry tests ────────────────────────────────────────────────

describe("Delay block symmetry (all types)", () => {
  for (const dlyType of DLY_TYPES) {
    it(`${dlyType}: encode(decode(zeros)) equals decode(zeros)`, () => {
      const bytes = new Array<number>(29).fill(0);
      bytes[0] = 1;
      bytes[1] = DLY_TYPE_IDX[dlyType];

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
      const bytes = new Array<number>(20).fill(0);
      bytes[0] = 1;
      bytes[1] = REV_TYPE_IDX[revType];

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


// ── Key (MEMORY%OTHER byte 4) ─────────────────────────────────────────────────

describe("Key", () => {
  it("decodes the default key", () => {
    expect(decodeKey(hexFromBytes(new Array<number>(7).fill(0)))).toBe("C");
  });

  it("decodes a non-default key", () => {
    const bytes = new Array<number>(7).fill(0);
    bytes[4] = 7; // G
    expect(decodeKey(hexFromBytes(bytes))).toBe("G");
  });

  it("encodes a key while preserving the rest of MEMORY%OTHER untouched", () => {
    const original = [6, 4, 7, 8, 0, 1, 0];
    const result = bytesFromHex(encodeKey("G", hexFromBytes(original)));
    expect(result[4]).toBe(7);
    expect(result).toEqual([6, 4, 7, 8, 7, 1, 0]);
  });
});


// ── Malformed/unmapped byte handling ──────────────────────────────────────────
//
// Decoding never throws on an out-of-range byte — lookupName falls back to an
// UNKNOWN_N sentinel so a corrupt or newer-firmware value degrades gracefully
// instead of crashing the whole patch read.

describe("Malformed/unmapped byte handling", () => {
  it("decodeChain stops and returns a partial order when it hits an unmapped chain value", () => {
    // byte 0 = 99 doesn't correspond to any block in CHAIN_VALUE_TO_NAME
    expect(decodeChain(hexFromBytes([99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toEqual([]);
  });

  it("encodeNs preserves an out-of-range detect byte instead of overwriting it", () => {
    const bytes = [1, 30, 30, 99]; // byte 3 = 99, outside NS_DETECT's 2-entry range
    const decoded = decodeNs(hexFromBytes(bytes));
    expect(decoded.detect).toBe("UNKNOWN_99");
    expect(bytesFromHex(encodeNs(decoded))[3]).toBe(99);
  });

  it("decodeFv defaults curve to NORMAL when the raw array has no 4th byte", () => {
    expect(decodeFv(hexFromBytes([100, 0, 100])).curve).toBe("NORMAL");
  });

  it("encodeFv leaves a 3-byte raw array untouched (no curve byte to write)", () => {
    const bytes = [100, 0, 100];
    const decoded = decodeFv(hexFromBytes(bytes));
    expect(bytesFromHex(encodeFv(decoded))).toEqual(bytes);
  });

  it("encodeFv preserves an out-of-range curve byte instead of overwriting it", () => {
    const bytes = [100, 0, 100, 99]; // byte 3 = 99, outside FV_CURVE's 4-entry range
    const decoded = decodeFv(hexFromBytes(bytes));
    expect(decoded.curve).toBe("UNKNOWN_99");
    expect(bytesFromHex(encodeFv(decoded))[3]).toBe(99);
  });

  it("decodeDelay returns a bare on/type block for a byte outside the known DLY_TYPES range", () => {
    const bytes = new Array<number>(29).fill(0);
    bytes[1] = 250;
    expect(decodeDelay(hexFromBytes(bytes))).toEqual({ on: false, type: "UNKNOWN_250", [RAW]: bytes });
  });

  it("decodeReverb returns a bare on/type block for a byte outside the known REV_TYPES range", () => {
    const bytes = new Array<number>(20).fill(0);
    bytes[1] = 250;
    expect(decodeReverb(hexFromBytes(bytes))).toEqual({ on: false, type: "UNKNOWN_250", [RAW]: bytes });
  });

  it("decodePfx returns a bare on/type block for a byte outside the known PFX_TYPES range", () => {
    const bytes = new Array<number>(14).fill(0);
    bytes[1] = 250;
    expect(decodePfx(hexFromBytes(bytes))).toEqual({ on: false, type: "UNKNOWN_250", [RAW]: bytes });
  });
});


// ── Real device values (factory default init patch) ──────────────────────────
//
// default-init.tsl is a real GX-1 factory-default patch export. Every block below
// asserts against that patch's actually-active type. Every delay/reverb/pfx type
// that ISN'T the patch's active type still has the device's own factory-default
// bytes sitting in its "shadow" byte range (the union region shared by all types of
// that slot), so overriding just the type selector and decoding the same real bytes
// still exercises genuine device data for every field checked below.

describe("Real device values (default-init.tsl)", () => {
  const file = readFile(DEFAULT_INIT_FIXTURE);
  const patch = file.patches[0];
  const dlyBytes = bytesFromHex(patch[RAW]["MEMORY%DLY"]);
  const revBytes = bytesFromHex(patch[RAW]["MEMORY%REV"]);
  const pfxBytes = bytesFromHex(patch[RAW]["MEMORY%PFX"]);

  it("decodes the active chain order", () => {
    expect(patch.chain).toEqual(["PFX", "FX1", "OD/DS", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"]);
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

  it("decodes the dedicated DLY block (active type: STANDARD)", () => {
    expect(patch.delay).toMatchObject({ type: "STANDARD", time: 400, feedback: 30, level: 50, highCut: "6.3kHz" });
  });

  it("decodes the dedicated REV block (active type: HALL M)", () => {
    expect(patch.reverb).toMatchObject({
      type: "HALL M", time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100,
    });
  });

  it("decodes the patch's key (byte 4 of MEMORY%OTHER)", () => {
    expect(patch.key).toBe("C");
  });

  // The following decode the SAME real device bytes above, but under a different
  // type selector, to reach fields the default patch's active type doesn't cover.
  // Every byte read is still a genuine device default — only the type string passed
  // to decodeDelay/decodeReverb/decodePfx is synthetic.

  it("decodes DLY shadow bytes for MODULATE (shares time/feedback/level/highCut with STANDARD)", () => {
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX.MODULATE, ...dlyBytes.slice(2)])))
      .toMatchObject({ time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 50, modDepth: 30 });
  });

  it("decodes DLY shadow bytes for ANALOG (its own 4-byte time at offset 13)", () => {
    // highCut is the same shared byte STANDARD (the patch's active type) left at "6.3kHz";
    // ANALOG's own device-default of "FLAT" only applies when ANALOG itself is selected.
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX.ANALOG, ...dlyBytes.slice(2)])))
      .toMatchObject({ time: 400, feedback: 30, level: 50, highCut: "6.3kHz" });
  });

  it("decodes DLY shadow bytes for WARP (time shared at offset 2, trigger/level at 21/25)", () => {
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX.WARP, ...dlyBytes.slice(2)])))
      .toMatchObject({ on: false, type: "WARP", time: 400, trigger: 0, level: 50 });
  });

  it("decodes DLY shadow bytes for GLITCH (own 1-byte time at offset 26, not the shared 4-byte field)", () => {
    expect(decodeDelay(hexFromBytes([...dlyBytes.slice(0, 1), DLY_TYPE_IDX.GLITCH, ...dlyBytes.slice(2)])))
      .toMatchObject({ on: false, type: "GLITCH", trigger: 0, time: 50, glitch: 50, balance: 100 });
  });

  it("decodes REV shadow bytes for SHIMMER (its own level at offset 10, not the shared EFFECT_LEVEL at 5)", () => {
    expect(decodeReverb(hexFromBytes([...revBytes.slice(0, 1), REV_TYPE_IDX.SHIMMER, ...revBytes.slice(2)])))
      .toMatchObject({ on: false, type: "SHIMMER", time: 2.6, tone: 0, preDelay: 30, pitch: 12, level: 100 });
  });

  it("decodes REV shadow bytes for SUB DELAY (its own 4-byte time at offset 11)", () => {
    expect(decodeReverb(hexFromBytes([...revBytes.slice(0, 1), REV_TYPE_IDX["SUB DELAY"], ...revBytes.slice(2)])))
      .toMatchObject({ on: false, type: "SUB DELAY", time: 400, level: 50, feedback: 30, highCut: "6.3kHz" });
  });

  it("decodes REV shadow bytes for TERA ECHO (spreadTime at 18, not a shared time field)", () => {
    expect(decodeReverb(hexFromBytes([...revBytes.slice(0, 1), REV_TYPE_IDX["TERA ECHO"], ...revBytes.slice(2)])))
      .toMatchObject({ on: false, type: "TERA ECHO", tone: 0, level: 25, direct: 100, feedback: 30, spreadTime: 50, trigger: 0 });
  });

  it("decodes PFX shadow bytes for PEDAL BEND (its own pitchMin/pitchMax at offset 9/10)", () => {
    expect(decodePfx(hexFromBytes([...pfxBytes.slice(0, 1), PFX_TYPE_IDX["PEDAL BEND"], ...pfxBytes.slice(2)])))
      .toMatchObject({ on: false, type: "PEDAL BEND", pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 });
  });
});
