import {
  FX_TYPES, FX_TYPE_IDX, FX_SUBTYPE_LISTS,
  WAH_TYPES, ROTARY_SPEED, FB_MODE, RING_INTL, HUM_VOWELS, HUM_MODES,
  SBEND_PITCH, SLICER_PAT, HARMONIST_HR, HARMONIST_KEY,
  REV_TYPES,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, CHORUS_TYPES, VIBE_MODES,
} from "../common";
import type { FxParams } from "../types";
import { hexFromBytes, lookupName, lookupIndex } from "./primitives";
import { u8, signed, lookup, scaled, u16be, decodeFields, encodeFields, type FieldCodec } from "./fields";

// ── FX type encode / decode ───────────────────────────────────────────────────

/**
 * Decode the two FX_COM bytes (hi=type index, lo=subType index) into names.
 * Falls back to "UNKNOWN_N" for out-of-range byte values.
 */
const decodeFxType = (hi: number, lo: number): [string, string | null] => {
  const fxName = lookupName(FX_TYPES, hi, "FX");
  const subTypeList = FX_SUBTYPE_LISTS[fxName];
  const subType = subTypeList ? lookupName(subTypeList, lo) : null;
  return [fxName, subType];
};

/**
 * Encode an FX type name (and optional subType) back to two byte values.
 * When the subType was decoded as UNKNOWN_N (out-of-range), we return 0 for the
 * subType byte; the caller (encodeFxCom in blocks.ts) preserves the original byte.
 */
const encodeFxType = (fxName: string, subType?: string | null): [number, number] => {
  const hi = lookupIndex(FX_TYPE_IDX, fxName, "FX type");
  const subTypeList = FX_SUBTYPE_LISTS[fxName];
  const subTypeIsKnown = subTypeList && subType != null && !subType.startsWith("UNKNOWN_");
  const lo = subTypeIsKnown ? subTypeList.indexOf(subType) : 0;
  return [hi, lo];
};


// ── FX parameter field maps ───────────────────────────────────────────────────
//
// Each key maps an FX type name to an ordered list of FieldCodec descriptors.
// The same table drives both decode (bytes → params) and encode (params → bytes),
// replacing the previous two parallel ~40-branch if-chains with one source of truth.
//
// Byte offsets are 0-based within the per-slot FX param block (the 251-byte block
// stored under MEMORY%FX1 / FX2 / FX3). Unmapped byte positions pass through
// unchanged — they come from the original bytes and are preserved on round-trip.

const WAH_FILTER   = ["LPF", "BPF", "HPF"] as const;
const WAH_POLARITY = ["DOWN", "UP"] as const;

// Known byte offsets for each FX type within the 251-byte FX param block.
// All other effects default to offset 0 (params start at the beginning of the block).
// Confirmed offsets (all from GLASSY DIST + SWORD LEAD + DROPTUNE RIFF diff analysis):
//   TUNE DOWN=8, GEQ=38, HIGH GEQ=52, CHORUS=122, TREMOLO=160.
const FX_PARAM_OFFSETS: Partial<Record<string, number>> = {
  "TUNE DOWN": 8,
  "GEQ":       38,
  "HIGH GEQ":  52,
  "CHORUS":    122,
  "TREMOLO":   160,
};

const FX_PARAM_MAPS: Partial<Record<string, FieldCodec[]>> = {
  // COMPRESSOR: p[0]=type (stored in param block, NOT FX_COM byte[2]),
  // p[1]=sustain, p[2]=attack, p[3]=level.
  "COMPRESSOR": [
    lookup("type", 0, COMP_TYPES), u8("sustain", 1), u8("attack", 2), u8("level", 3),
  ],
  // LIMITER: p[0]=type (stored in param block), then params shifted by one.
  "LIMITER": [
    lookup("type", 0, LIM_TYPES),
    u8("threshold", 1), u8("ratio", 2), u8("level", 3), u8("attack", 4), u8("release", 5),
  ],
  "ENHANCER": [
    u8("sens", 0), u8("low", 1), u8("lowFreq", 2),
    u8("high", 3), u8("highFreq", 4), u8("level", 5),
  ],
  "TOUCH WAH": [
    lookup("filter", 0, WAH_FILTER), lookup("polarity", 1, WAH_POLARITY),
    u8("sens", 2), u8("level", 3), u8("freq", 4), u8("reso", 5), u8("decay", 6),
  ],
  "AUTO WAH": [
    lookup("filter", 0, WAH_FILTER),
    u8("rate", 1), u8("depth", 2), u8("level", 3), u8("freq", 4), u8("reso", 5),
  ],
  "FIXED WAH": [
    lookup("wahType", 0, WAH_TYPES), u8("freq", 1), u8("level", 2), u8("direct", 3),
  ],
  "DEFRETTER": [
    u8("sens", 0), u8("depth", 1), signed("tone", 2), u8("level", 3),
    u8("attack", 4), u8("reso", 5), u8("direct", 6),
  ],
  "SLOW GEAR": [
    u8("sens", 0), u8("riseTime", 1), u8("level", 2),
  ],
  "AC. GTR SIM": [
    u8("body", 0), signed("low", 1), signed("high", 2), u8("level", 3),
  ],
  // AC RESO: p[0]=type (stored in param block), then params shifted by one.
  "AC RESO": [
    lookup("type", 0, ACRESO_TYPES),
    u8("reso", 1), signed("tone", 2), u8("level", 3),
  ],
  "SITAR SIM": [
    u8("sens", 0), u8("depth", 1), signed("tone", 2), u8("level", 3),
    u8("reso", 4), u8("buzz", 5), u8("direct", 6),
  ],
  "FEEDBACKER": [
    lookup("mode", 0, FB_MODE), u8("trigger", 1), u8("depth", 2), u8("riseTime", 3),
    u8("octRiseTm", 4), u8("feedback", 5), u8("octFeedback", 6),
  ],
  // OD/DS: the drive/tone/level/direct bytes live in the param block; the "type" field
  // (which OD/DS pedal model is selected) lives in the FX_COM subtype byte, so it is
  // injected from outside after decoding rather than read from the param block.
  "OD/DS": [
    u8("drive", 0), signed("tone", 1), u8("level", 2), u8("direct", 3),
  ],
  "PARA. EQ": [
    signed("level", 0, 20), signed("lowGain", 1, 20),
    signed("midGain", 2, 20), signed("highGain", 3, 20),
    u8("lowCut", 4), u8("midFreq", 5), u8("highCut", 6),
  ],
  // GEQ band gains use signed(centre=20) — each band covers ±20 dB.
  "GEQ": [
    signed("125Hz", 0, 20), signed("250Hz", 1, 20), signed("500Hz", 2, 20),
    signed("1kHz",  3, 20), signed("2kHz",  4, 20), signed("4kHz",  5, 20),
    signed("level", 6, 20),
  ],
  "LOW GEQ": [
    signed("63Hz",  0, 20), signed("125Hz", 1, 20), signed("250Hz", 2, 20),
    signed("500Hz", 3, 20), signed("1kHz",  4, 20), signed("2kHz",  5, 20),
    signed("level", 6, 20),
  ],
  // HIGH GEQ: params start at byte 52 of the 251-byte FX block (see FX_PARAM_OFFSETS).
  // All bands and level use signed(centre=20). Band order: standard frequency order.
  "HIGH GEQ": [
    signed("250Hz", 0, 20), signed("500Hz", 1, 20), signed("1kHz", 2, 20),
    signed("2kHz",  3, 20), signed("4kHz",  4, 20), signed("8kHz", 5, 20),
    signed("level", 6, 20),
  ],
  // CHORUS: p[0]=type (stored in param block), then params shifted by one.
  // preDelay stored as index × 0.5ms (e.g. 8 → 4.0ms).
  "CHORUS": [
    lookup("type", 0, CHORUS_TYPES),
    u8("rate", 1), u8("depth", 2), u8("level", 3), scaled("preDelay", 4, 0.5),
  ],
  "FLANGER": [
    u8("rate", 0), u8("depth", 1), u8("manual", 2), u8("reso", 3), u8("level", 4),
  ],
  // PHASER: stage is stored as (stage−2)/2 and recovered as bytes[0]*2+2.
  "PHASER": [
    {
      name: "stage",
      decode: bytes => bytes[0]! * 2 + 2,
      encode: (value, bytes) => { bytes[0] = ((value as number) - 2) >> 1; },
    },
    u8("rate", 1), u8("depth", 2), u8("reso", 3), u8("manual", 4), u8("level", 5),
  ],
  "SCRIPT PH": [
    u8("rate", 0), u8("depth", 1), u8("level", 2),
  ],
  // CLASSIC-VIBE: p[0]=mode (stored in param block), then params shifted by one.
  "CLASSIC-VIBE": [
    lookup("type", 0, VIBE_MODES),
    u8("rate", 1), u8("depth", 2), u8("level", 3),
  ],
  "ROTARY": [
    lookup("speed", 0, ROTARY_SPEED),
    u8("slowRate", 1), u8("fastRate", 2), u8("level", 3), u8("balance", 4), u8("drive", 5),
  ],
  "VIBRATO": [
    u8("rate", 0), u8("depth", 1), u8("level", 2), u8("riseTime", 3), u8("trigger", 4),
  ],
  "TREMOLO": [
    u8("rate", 0), u8("depth", 1), u8("level", 2),
  ],
  "SLICER": [
    lookup("pattern", 0, SLICER_PAT),
    u8("rate", 1), u8("level", 2), u8("attack", 3), u8("duty", 4),
  ],
  "OVERTONE": [
    u8("lower", 0), u8("upper", 1), u8("unison", 2), u8("direct", 3), u8("detune", 4),
  ],
  "PAN": [
    u8("rate", 0), u8("depth", 1), u8("level", 2),
  ],
  "RING MOD": [
    lookup("intelligent", 0, RING_INTL),
    u8("freq", 1), u8("modRate", 2), u8("modDepth", 3), u8("level", 4), u8("direct", 5),
  ],
  // HUMANIZER: p[0]=mode (stored in param block), then params shifted by one.
  "HUMANIZER": [
    lookup("type", 0, HUM_MODES),
    lookup("vowel1", 1, HUM_VOWELS), lookup("vowel2", 2, HUM_VOWELS),
    u8("sens", 3), u8("rate", 4), u8("manual", 5), u8("level", 6),
  ],
  // PITCH SHIFT: pitch stored as (pitch + 24), range −24..+24 semitones.
  "PITCH SHIFT": [
    signed("pitch", 0, 24),
    u8("mode", 1), u8("level", 2), u8("preDelay", 3), u8("feedback", 4), u8("direct", 5),
  ],
  // HARMONIST: harmony decoded as an interval string (e.g. "0:M3") when in range,
  // or as a raw number when the index is out of the HARMONIST_HR table.
  "HARMONIST": [
    {
      name: "harmony",
      decode: bytes => {
        const index = bytes[0]!;
        return index < HARMONIST_HR.length ? HARMONIST_HR[index]! : index;
      },
      encode: (value, bytes) => {
        const index = typeof value === "string" ? HARMONIST_HR.indexOf(value) : -1;
        bytes[0] = index >= 0 ? index : (value as number);
      },
    },
    lookup("key", 1, HARMONIST_KEY),
    u8("level", 2), u8("preDelay", 3), u8("feedback", 4), u8("direct", 5),
  ],
  "OCTAVE": [
    u8("minus2Oct", 0), u8("minus1Oct", 1), u8("direct", 2),
  ],
  "HEAVY OCT": [
    u8("minus2Oct", 0), u8("minus1Oct", 1), u8("direct", 2),
  ],
  "S-BEND": [
    u8("trigger", 0), lookup("pitch", 1, SBEND_PITCH), u8("riseTime", 2), u8("fallTime", 3),
  ],
  // PEDAL BEND: pitchMin/pitchMax stored as (value + 24), range −24..+24 semitones.
  "PEDAL BEND": [
    signed("pitchMin", 0, 24), signed("pitchMax", 1, 24),
    u8("pdlPos", 2), u8("level", 3), u8("direct", 4),
  ],
  // TUNE DOWN: pitch stored as (pitch + 12), range −12..0 semitones.
  "TUNE DOWN": [
    signed("pitch", 0, 12),
  ],
  // DELAY as an FX slot type (separate from the dedicated DLY block):
  "DELAY": [
    u16be("time", 0), u8("feedback", 2), u8("level", 3), u8("highCut", 4), u8("direct", 5),
  ],
  // REVERB as an FX slot type (separate from the dedicated REV block):
  "REVERB": [
    lookup("type", 0, REV_TYPES), scaled("time", 1, 0.1),
    u8("preDelay", 2), u8("level", 3), u8("direct", 4),
  ],
};


// ── Public decode / encode ────────────────────────────────────────────────────

/**
 * Decode the 251-byte FX parameter block for a given effect type.
 *
 * Returns a typed params object for known types. For unrecognised types, returns
 * `{ unknownBytes: rawBytes }` so the round-trip encoder can preserve the original
 * bytes unchanged without data loss.
 *
 * OD/DS injects the pedal model name from the FX_COM subtype byte (`sub`) rather
 * than the param block — see the "OD/DS" entry in FX_PARAM_MAPS.
 */
const decodeFxParams = (fxType: string, subType: string | null, bytes: number[]): FxParams => {
  const fields = FX_PARAM_MAPS[fxType];
  if (!fields) return { unknownBytes: bytes.slice(0, 32) };

  const offset = FX_PARAM_OFFSETS[fxType] ?? 0;
  const params = decodeFields(fields, offset > 0 ? bytes.slice(offset) : bytes);
  if (fxType === "OD/DS") params["type"] = subType ?? "";
  return params;
};

/**
 * Encode FX params back into the 251-byte hex block.
 * Always starts from `originalBytes` so unmapped positions are preserved.
 * When params contains `unknownBytes`, the original bytes are returned unchanged.
 */
const encodeFxParams = (
  fxType: string,
  params: FxParams,
  originalBytes: number[],
): string[] => {
  if ("unknownBytes" in params) return hexFromBytes(originalBytes);

  const bytes = [...originalBytes];
  const fields = FX_PARAM_MAPS[fxType];
  if (fields) {
    const offset = FX_PARAM_OFFSETS[fxType] ?? 0;
    if (offset > 0) {
      const slice = bytes.slice(offset);
      encodeFields(fields, params, slice);
      bytes.splice(offset, slice.length, ...slice);
    } else {
      encodeFields(fields, params, bytes);
    }
  }
  return hexFromBytes(bytes);
};

export { decodeFxType, encodeFxType, decodeFxParams, encodeFxParams };
