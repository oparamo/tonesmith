import { describe, it, expect } from "vitest";
import {
  decodeDelay, encodeDelay, decodeReverb, encodeReverb, decodeChain, encodeChain, decodePedalFx,
  decodeKey, encodeKey, decodeNoiseGate, encodeNoiseGate, decodeVolume, encodeVolume, decodeName, encodeName,
} from "../../../src/devices/gx1/codec/blocks";
import { bytesFromHex, hexFromBytes } from "../../../src/devices/gx1/codec/primitives";
import {
  DLY_TYPES, REV_TYPES, DLY_TYPE_IDX, REV_TYPE_IDX, PFX_TYPE_IDX, RAW, DEFAULT_CHAIN,
} from "../../../src/devices/gx1/common";
import { DEFAULT_INIT_FIXTURE, patchAt, rawBlock } from "../../helpers";

// ── Delay block symmetry tests ────────────────────────────────────────────────

describe("Delay block symmetry (all types)", () => {
  it.each(DLY_TYPES)("%s: encode(decode(zeros)) equals decode(zeros)", (dlyType) => {
    const bytes = new Array<number>(29).fill(0);
    bytes[0] = 1;
    bytes[1] = DLY_TYPE_IDX[dlyType];
    const hexList = hexFromBytes(bytes);

    const decoded = decodeDelay(hexList);
    const reencoded = encodeDelay(decoded);
    const reDecoded = decodeDelay(reencoded);

    expect(reDecoded).toEqual(decoded);
  });
});


// ── Reverb block symmetry tests ───────────────────────────────────────────────

describe("Reverb block symmetry (all types)", () => {
  it.each(REV_TYPES)("%s: encode(decode(zeros)) equals decode(zeros)", (revType) => {
    const bytes = new Array<number>(20).fill(0);
    bytes[0] = 1;
    bytes[1] = REV_TYPE_IDX[revType];
    const hexList = hexFromBytes(bytes);

    const decoded = decodeReverb(hexList);
    const reencoded = encodeReverb(decoded);
    const reDecoded = decodeReverb(reencoded);

    expect(reDecoded).toEqual(decoded);
  });
});


// ── Chain block (real device values) ─────────────────────────────────────────
//
// MEMORY%CHAIN is a linked list (see CHAIN_SLOT_ORDER in common/constants.ts), not a
// positional array: byte 0 is whichever block comes first, and byte
// (1 + CHAIN_SLOT_ORDER.indexOf(name)) is the firmware value of whatever follows that
// specific block. These byte arrays are real values read off a GX-1 after performing
// each reorder on the device itself, not self-consistency round-trips.

describe("Chain block (real device values)", () => {
  const DEFAULT_BYTES = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 11, 12];
  const DEFAULT_ORDER = ["pedalFx", "fx1", "drive", "amp", "noiseGate", "volume", "fx2", "fx3", "delay", "reverb"];
  const FX2_FX3_SWAP_BYTES = [1, 2, 3, 4, 7, 9, 5, 8, 6, 10, 0, 11, 12];
  const FX2_FX3_SWAP_ORDER = ["pedalFx", "fx1", "drive", "amp", "noiseGate", "volume", "fx3", "fx2", "delay", "reverb"];
  const AMP_OD_DS_SWAP_BYTES = [1, 2, 4, 7, 3, 6, 9, 8, 5, 10, 0, 11, 12];
  const AMP_OD_DS_SWAP_ORDER = ["pedalFx", "fx1", "amp", "drive", "noiseGate", "volume", "fx2", "fx3", "delay", "reverb"];

  it("decodes the untouched default chain", () => {
    const hexList = hexFromBytes(DEFAULT_BYTES);

    const decoded = decodeChain(hexList);

    expect(decoded).toEqual(DEFAULT_ORDER);
  });

  it("decodes an FX2/FX3 swap", () => {
    const hexList = hexFromBytes(FX2_FX3_SWAP_BYTES);

    const decoded = decodeChain(hexList);

    expect(decoded).toEqual(FX2_FX3_SWAP_ORDER);
  });

  it("decodes an AMP/OD-DS swap", () => {
    const hexList = hexFromBytes(AMP_OD_DS_SWAP_BYTES);

    const decoded = decodeChain(hexList);

    expect(decoded).toEqual(AMP_OD_DS_SWAP_ORDER);
  });

  it("encodes the default order back to the real device bytes", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);

    const encoded = encodeChain(DEFAULT_ORDER, originalHex);

    expect(encoded).toEqual(originalHex);
  });

  it("encodes an FX2/FX3 swap to the real device bytes", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);
    const expectedHex = hexFromBytes(FX2_FX3_SWAP_BYTES);

    const encoded = encodeChain(FX2_FX3_SWAP_ORDER, originalHex);

    expect(encoded).toEqual(expectedHex);
  });

  it("encodes an AMP/OD-DS swap to the real device bytes", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);
    const expectedHex = hexFromBytes(AMP_OD_DS_SWAP_BYTES);

    const encoded = encodeChain(AMP_OD_DS_SWAP_ORDER, originalHex);

    expect(encoded).toEqual(expectedHex);
  });

  it("preserves unused trailing bytes from the original param set", () => {
    const originalWithJunk = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 99, 42];
    const originalHex = hexFromBytes(originalWithJunk);

    const encodedHex = encodeChain(DEFAULT_ORDER, originalHex);
    const result = bytesFromHex(encodedHex);
    const trailingBytes = result.slice(11);

    expect(trailingBytes).toEqual([99, 42]);
  });

  // The firmware stores the chain as a linked list keyed by block, so a repeat overwrites its own
  // slot and drops every block between the two occurrences. Encoding such a chain "succeeds" while
  // silently losing blocks, so it has to be refused outright.
  it("refuses a chain that repeats a block", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);
    const duplicated = ["amp", ...DEFAULT_ORDER];

    expect(() => { encodeChain(duplicated, originalHex); }).toThrow(/amp/);
  });

  it("refuses a chain that drops a block", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);
    const missingGate = DEFAULT_ORDER.filter(name => name !== "noiseGate");

    expect(() => { encodeChain(missingGate, originalHex); }).toThrow(/noiseGate/);
  });

  it("names every valid block when refusing an unknown one", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);
    const bogus = DEFAULT_ORDER.map(name => (name === "noiseGate" ? "gate" : name));

    expect(() => { encodeChain(bogus, originalHex); })
      .toThrow(new RegExp(DEFAULT_CHAIN.join(", ")));
  });

  // write_fields and the CLI both hand through whatever a dot-path edit produced, so a caller who
  // sets `chain` to a bare string reaches the codec with a non-array.
  it("refuses a chain that isn't a list", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);

    expect(() => { encodeChain("fx1,amp" as unknown as string[], originalHex); }).toThrow();
  });
});


// ── Key (MEMORY%OTHER byte 4) ─────────────────────────────────────────────────

describe("Key", () => {
  it("decodes the default key", () => {
    const bytes = new Array<number>(7).fill(0);
    const hexList = hexFromBytes(bytes);

    const key = decodeKey(hexList);

    expect(key).toBe("C");
  });

  it("decodes a non-default key", () => {
    const bytes = new Array<number>(7).fill(0);
    bytes[4] = 7; // G
    const hexList = hexFromBytes(bytes);

    const key = decodeKey(hexList);

    expect(key).toBe("G");
  });

  it("encodes a key while preserving the rest of MEMORY%OTHER untouched", () => {
    const original = [6, 4, 7, 8, 0, 1, 0];
    const originalHex = hexFromBytes(original);

    const encodedHex = encodeKey("G", originalHex);
    const result = bytesFromHex(encodedHex);

    expect(result[4]).toBe(7);
    expect(result).toEqual([6, 4, 7, 8, 7, 1, 0]);
  });
});


// ── Malformed/unmapped byte handling ──────────────────────────────────────────
//
// Decoding never throws on an out-of-range byte, because lookupName falls back to an
// UNKNOWN_N sentinel so a corrupt or newer-firmware value degrades gracefully
// instead of crashing the whole patch read.

describe("Malformed/unmapped byte handling", () => {
  it("decodeChain stops and returns a partial order when it hits an unmapped chain value", () => {
    // byte 0 = 99 doesn't correspond to any block in CHAIN_VALUE_TO_BLOCK
    const bytes = [99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const hexList = hexFromBytes(bytes);

    const decoded = decodeChain(hexList);

    expect(decoded).toEqual([]);
  });

  it("encodeNoiseGate preserves an out-of-range detect byte instead of overwriting it", () => {
    const bytes = [1, 30, 30, 99]; // byte 3 = 99, outside NS_DETECT's 2-entry range
    const hexList = hexFromBytes(bytes);

    const decoded = decodeNoiseGate(hexList);
    const encodedHex = encodeNoiseGate(decoded);
    const reencoded = bytesFromHex(encodedHex);

    expect(decoded.params.detect).toBe("UNKNOWN_99");
    expect(reencoded[3]).toBe(99);
  });

  it("decodeVolume defaults curve to NORMAL when the raw array has no 4th byte", () => {
    const hexList = hexFromBytes([100, 0, 100]);

    const decoded = decodeVolume(hexList);

    expect(decoded.params.curve).toBe("NORMAL");
  });

  it("encodeVolume leaves a 3-byte raw array untouched (no curve byte to write)", () => {
    const bytes = [100, 0, 100];
    const hexList = hexFromBytes(bytes);
    const decoded = decodeVolume(hexList);

    const encodedHex = encodeVolume(decoded);
    const result = bytesFromHex(encodedHex);

    expect(result).toEqual(bytes);
  });

  it("encodeVolume preserves an out-of-range curve byte instead of overwriting it", () => {
    const bytes = [100, 0, 100, 99]; // byte 3 = 99, outside FV_CURVE's 4-entry range
    const hexList = hexFromBytes(bytes);
    const decoded = decodeVolume(hexList);

    const encodedHex = encodeVolume(decoded);
    const result = bytesFromHex(encodedHex);

    expect(decoded.params.curve).toBe("UNKNOWN_99");
    expect(result[3]).toBe(99);
  });

  it("decodeDelay returns a bare on/type block for a byte outside the known DLY_TYPES range", () => {
    const bytes = new Array<number>(29).fill(0);
    bytes[1] = 250;
    const hexList = hexFromBytes(bytes);

    const decoded = decodeDelay(hexList);

    expect(decoded).toEqual({ on: false, type: "UNKNOWN_250", params: {}, [RAW]: bytes });
  });

  it("decodeReverb returns a bare on/type block for a byte outside the known REV_TYPES range", () => {
    const bytes = new Array<number>(20).fill(0);
    bytes[1] = 250;
    const hexList = hexFromBytes(bytes);

    const decoded = decodeReverb(hexList);

    expect(decoded).toEqual({ on: false, type: "UNKNOWN_250", params: {}, [RAW]: bytes });
  });

  it("decodePedalFx returns a bare on/type block for a byte outside the known PFX_TYPES range", () => {
    const bytes = new Array<number>(14).fill(0);
    bytes[1] = 250;
    const hexList = hexFromBytes(bytes);

    const decoded = decodePedalFx(hexList);

    expect(decoded).toEqual({ on: false, type: "UNKNOWN_250", subType: null, params: {}, [RAW]: bytes });
  });
});


// ── Name block ────────────────────────────────────────────────────────────────

describe("Name block", () => {
  it("round-trips a name byte the device's own character set does not reach", () => {
    const bytes = [0x41, 0xC3, 0xA9, ...new Array<number>(13).fill(0x20)];

    const reencoded = bytesFromHex(encodeName(decodeName(hexFromBytes(bytes))));

    expect(reencoded).toEqual(bytes);
  });

  it("pads a short name out to the full block with spaces", () => {
    const encoded = bytesFromHex(encodeName("AB"));

    expect(encoded).toEqual([0x41, 0x42, ...new Array<number>(14).fill(0x20)]);
  });

  it("throws on a name longer than the block rather than storing a truncation", () => {
    const encodeLongName = () => encodeName("x".repeat(17));

    expect(encodeLongName).toThrow(/16/);
  });
});


// ── Values the device has no byte for ─────────────────────────────────────────

describe("Values the device has no byte for", () => {
  it("encodeNoiseGate throws on a detect the device does not name", () => {
    const block = { on: true, params: { threshold: 30, release: 30, detect: "BOGUS" }, [RAW]: [1, 30, 30, 0] };

    const encodeBadDetect = () => encodeNoiseGate(block);

    expect(encodeBadDetect).toThrow(/BOGUS/);
  });

  it("encodeVolume throws on a curve the device does not name", () => {
    const block = { params: { position: 100, min: 0, max: 100, curve: "BOGUS" }, [RAW]: [100, 0, 100, 2] };

    const encodeBadCurve = () => encodeVolume(block);

    expect(encodeBadCurve).toThrow(/BOGUS/);
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
  const patch = patchAt(DEFAULT_INIT_FIXTURE);
  const dlyBytes = bytesFromHex(rawBlock(patch, "MEMORY%DLY"));
  const revBytes = bytesFromHex(rawBlock(patch, "MEMORY%REV"));
  const pfxBytes = bytesFromHex(rawBlock(patch, "MEMORY%PFX"));

  it("decodes the active chain order", () => {
    expect(patch.chain).toEqual(DEFAULT_CHAIN);
  });

  it("decodes the drive block", () => {
    expect(patch.drive.type).toBe("OVERDRIVE");
    expect(patch.drive.params).toMatchObject({
      drive: 50, tone: 0, level: 50, direct: 0, solo: false, soloLevel: 50,
    });
  });

  it("decodes AMP", () => {
    expect(patch.amp.type).toBe("NATURAL");
    expect(patch.amp.params).toMatchObject({
      speaker: "ORIGINAL", gain: 50, level: 50,
      bass: 50, middle: 50, treble: 50, mic: "DYN421", solo: false, soloLevel: 50,
    });
  });

  it("decodes PFX (active type: WAH)", () => {
    expect(patch.pedalFx).toMatchObject({ on: false, type: "WAH", subType: "CRY WAH" });
    expect(patch.pedalFx.params).toMatchObject({ level: 100, direct: 0, position: 100, min: 0, max: 100 });
  });

  it("decodes NS", () => {
    expect(patch.noiseGate.params).toMatchObject({ threshold: 30, release: 30 });
  });

  it("decodes FV", () => {
    expect(patch.volume.params).toMatchObject({ position: 100, min: 0, max: 100 });
  });

  it("decodes the dedicated DLY block (active type: STANDARD)", () => {
    expect(patch.delay.type).toBe("STANDARD");
    expect(patch.delay.params).toMatchObject({ time: 400, feedback: 30, level: 50, highCut: "6.3kHz" });
  });

  it("decodes the dedicated REV block (active type: HALL M)", () => {
    expect(patch.reverb.type).toBe("HALL M");
    expect(patch.reverb.params).toMatchObject({
      time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100,
    });
  });

  it("decodes the patch's key (byte 4 of MEMORY%OTHER)", () => {
    expect(patch.key).toBe("C");
  });

  // The following decode the SAME real device bytes above, but under a different
  // type selector, to reach fields the default patch's active type doesn't cover.
  // Every byte read is still a genuine device default. Only the type string passed
  // to decodeDelay/decodeReverb/decodePedalFx is synthetic.

  it("decodes DLY shadow bytes for MODULATE (shares time/feedback/level/highCut with STANDARD)", () => {
    const modulateBytes = [...dlyBytes.slice(0, 1), DLY_TYPE_IDX.MODULATE, ...dlyBytes.slice(2)];
    const hexList = hexFromBytes(modulateBytes);

    const decoded = decodeDelay(hexList);

    expect(decoded.params).toMatchObject({ time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 50, modDepth: 30 });
  });

  it("decodes DLY shadow bytes for ANALOG (its own 4-byte time at offset 13)", () => {
    // highCut is the same shared byte STANDARD (the patch's active type) left at "6.3kHz";
    // ANALOG's own device-default of "FLAT" only applies when ANALOG itself is selected.
    const analogBytes = [...dlyBytes.slice(0, 1), DLY_TYPE_IDX.ANALOG, ...dlyBytes.slice(2)];
    const hexList = hexFromBytes(analogBytes);

    const decoded = decodeDelay(hexList);

    expect(decoded.params).toMatchObject({ time: 400, feedback: 30, level: 50, highCut: "6.3kHz" });
  });

  it("decodes DLY shadow bytes for WARP (time shared at offset 2, trigger/level at 21/25)", () => {
    const warpBytes = [...dlyBytes.slice(0, 1), DLY_TYPE_IDX.WARP, ...dlyBytes.slice(2)];
    const hexList = hexFromBytes(warpBytes);

    const decoded = decodeDelay(hexList);

    expect(decoded).toMatchObject({ on: false, type: "WARP" });
    expect(decoded.params).toMatchObject({ time: 400, trigger: false, level: 50 });
  });

  it("decodes DLY shadow bytes for GLITCH (own 1-byte time at offset 26, not the shared 4-byte field)", () => {
    const glitchBytes = [...dlyBytes.slice(0, 1), DLY_TYPE_IDX.GLITCH, ...dlyBytes.slice(2)];
    const hexList = hexFromBytes(glitchBytes);

    const decoded = decodeDelay(hexList);

    expect(decoded).toMatchObject({ on: false, type: "GLITCH" });
    expect(decoded.params).toMatchObject({ trigger: false, time: 50, glitch: 50, balance: 100 });
  });

  it("decodes REV shadow bytes for SHIMMER (LEVEL is the shared EFFECT_LEVEL at 5; its own PITCH LVL is at offset 10)", () => {
    const shimmerBytes = [...revBytes.slice(0, 1), REV_TYPE_IDX.SHIMMER, ...revBytes.slice(2)];
    const hexList = hexFromBytes(shimmerBytes);

    const decoded = decodeReverb(hexList);

    expect(decoded).toMatchObject({ on: false, type: "SHIMMER" });
    expect(decoded.params).toMatchObject({
      time: 2.6, tone: 0, level: 25, preDelay: 30, pitch: 12, pitchLevel: 100,
    });
  });

  it("decodes REV shadow bytes for SUB DELAY (its own 4-byte time at offset 11)", () => {
    const subDelayBytes = [...revBytes.slice(0, 1), REV_TYPE_IDX["SUB DELAY"], ...revBytes.slice(2)];
    const hexList = hexFromBytes(subDelayBytes);

    const decoded = decodeReverb(hexList);

    expect(decoded).toMatchObject({ on: false, type: "SUB DELAY" });
    expect(decoded.params).toMatchObject({ time: 400, level: 50, feedback: 30, highCut: "6.3kHz" });
  });

  it("decodes REV shadow bytes for TERA ECHO (spreadTime at 18, not a shared time field)", () => {
    const teraEchoBytes = [...revBytes.slice(0, 1), REV_TYPE_IDX["TERA ECHO"], ...revBytes.slice(2)];
    const hexList = hexFromBytes(teraEchoBytes);

    const decoded = decodeReverb(hexList);

    expect(decoded).toMatchObject({ on: false, type: "TERA ECHO" });
    expect(decoded.params).toMatchObject({ tone: 0, level: 25, direct: 100, feedback: 30, spreadTime: 50, trigger: false });
  });

  it("decodes PFX shadow bytes for PEDAL BEND (its own pitchMin/pitchMax at offset 9/10)", () => {
    const pedalBendBytes = [...pfxBytes.slice(0, 1), PFX_TYPE_IDX["PEDAL BEND"], ...pfxBytes.slice(2)];
    const hexList = hexFromBytes(pedalBendBytes);

    const decoded = decodePedalFx(hexList);

    expect(decoded).toMatchObject({ on: false, type: "PEDAL BEND" });
    expect(decoded.params).toMatchObject({ pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 });
  });
});
