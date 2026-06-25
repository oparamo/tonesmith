import {
  FX_TYPES, FX_TYPE_IDX, FX_SUBTYPE_LISTS,
  WAH_TYPES, ROTARY_SPEED, FB_MODE, RING_INTL, HUM_VOWELS,
  SBEND_PITCH, SLICER_PAT, HARMONIST_HR, HARMONIST_KEY,
  REV_TYPES,
} from "../common/index.js";
import type { FxParams } from "../types/index.js";
import { hexFromBytes, lookupName, lookupIndex } from "./primitives.js";
import { u8, signed, lookup, scaled, u16be, decodeFields, encodeFields, type FieldCodec } from "./fields.js";

// ── FX type encode / decode ───────────────────────────────────────────────────

/**
 * Decode the two FX_COM bytes (hi=type index, lo=subtype index) into names.
 * Falls back to "UNKNOWN_N" for out-of-range byte values.
 */
const decodeFxType = (hi: number, lo: number): [string, string | null] => {
  const fxName = lookupName(FX_TYPES, hi, "FX");
  const subtypeList = FX_SUBTYPE_LISTS[fxName];
  const subtype = subtypeList ? lookupName(subtypeList, lo) : null;
  return [fxName, subtype];
};

/**
 * Encode an FX type name (and optional subtype) back to two byte values.
 * When the subtype was decoded as UNKNOWN_N (out-of-range), we return 0 for the
 * subtype byte; the caller (encodeFxCom in blocks.ts) preserves the original byte.
 */
const encodeFxType = (fxName: string, subtype?: string | null): [number, number] => {
  const hi = lookupIndex(FX_TYPE_IDX, fxName, "FX type");
  const subtypeList = FX_SUBTYPE_LISTS[fxName];
  const subtypeIsKnown = subtypeList && subtype != null && !subtype.startsWith("UNKNOWN_");
  const lo = subtypeIsKnown ? subtypeList.indexOf(subtype) : 0;
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

const FX_PARAM_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "COMPRESSOR": [
    u8("sustain", 0), u8("attack", 1), u8("level", 2),
  ],
  "LIMITER": [
    u8("threshold", 0), u8("ratio", 1), u8("level", 2), u8("attack", 3), u8("release", 4),
  ],
  "ENHANCER": [
    u8("sens", 0), u8("low", 1), u8("low_freq", 2),
    u8("high", 3), u8("high_freq", 4), u8("level", 5),
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
    lookup("wah_type", 0, WAH_TYPES), u8("freq", 1), u8("level", 2), u8("direct", 3),
  ],
  "DEFRETTER": [
    u8("sens", 0), u8("depth", 1), signed("tone", 2), u8("level", 3),
    u8("attack", 4), u8("reso", 5), u8("direct", 6),
  ],
  "SLOW GEAR": [
    u8("sens", 0), u8("rise_time", 1), u8("level", 2),
  ],
  "AC. GTR SIM": [
    u8("body", 0), signed("low", 1), signed("high", 2), u8("level", 3),
  ],
  "AC RESO": [
    u8("reso", 0), signed("tone", 1), u8("level", 2),
  ],
  "SITAR SIM": [
    u8("sens", 0), u8("depth", 1), signed("tone", 2), u8("level", 3),
    u8("reso", 4), u8("buzz", 5), u8("direct", 6),
  ],
  "FEEDBACKER": [
    lookup("mode", 0, FB_MODE), u8("trigger", 1), u8("depth", 2), u8("rise_time", 3),
    u8("oct_rise_tm", 4), u8("feedback", 5), u8("oct_feedback", 6),
  ],
  // OD/DS: the drive/tone/level/direct bytes live in the param block; the "type" field
  // (which OD/DS pedal model is selected) lives in the FX_COM subtype byte, so it is
  // injected from outside after decoding rather than read from the param block.
  "OD/DS": [
    u8("drive", 0), signed("tone", 1), u8("level", 2), u8("direct", 3),
  ],
  "PARA. EQ": [
    signed("level", 0, 20), signed("low_gain", 1, 20),
    signed("mid_gain", 2, 20), signed("high_gain", 3, 20),
    u8("low_cut", 4), u8("mid_freq", 5), u8("high_cut", 6),
  ],
  "GEQ": [
    signed("125Hz", 0), signed("250Hz", 1), signed("500Hz", 2),
    signed("1kHz", 3),  signed("2kHz", 4),  signed("4kHz", 5),
    signed("level", 6, 20),
  ],
  "LOW GEQ": [
    signed("63Hz",  0), signed("125Hz", 1), signed("250Hz", 2),
    signed("500Hz", 3), signed("1kHz",  4), signed("2kHz",  5),
    signed("level", 6, 20),
  ],
  "HIGH GEQ": [
    signed("250Hz", 0), signed("500Hz", 1), signed("1kHz", 2),
    signed("2kHz",  3), signed("4kHz",  4), signed("8kHz", 5),
    signed("level", 6, 20),
  ],
  "CHORUS": [
    u8("rate", 0), u8("depth", 1), u8("level", 2), u8("pre_delay", 3),
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
  "CLASSIC-VIBE": [
    u8("rate", 0), u8("depth", 1), u8("level", 2),
  ],
  "ROTARY": [
    lookup("speed", 0, ROTARY_SPEED),
    u8("slow_rate", 1), u8("fast_rate", 2), u8("level", 3), u8("balance", 4), u8("drive", 5),
  ],
  "VIBRATO": [
    u8("rate", 0), u8("depth", 1), u8("level", 2), u8("rise_time", 3), u8("trigger", 4),
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
    u8("freq", 1), u8("mod_rate", 2), u8("mod_depth", 3), u8("level", 4), u8("direct", 5),
  ],
  "HUMANIZER": [
    lookup("vowel1", 0, HUM_VOWELS), lookup("vowel2", 1, HUM_VOWELS),
    u8("sens", 2), u8("rate", 3), u8("manual", 4), u8("level", 5),
  ],
  // PITCH SHIFT: pitch stored as (pitch + 24), range −24..+24 semitones.
  "PITCH SHIFT": [
    signed("pitch", 0, 24),
    u8("mode", 1), u8("level", 2), u8("pre_delay", 3), u8("feedback", 4), u8("direct", 5),
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
    u8("level", 2), u8("pre_delay", 3), u8("feedback", 4), u8("direct", 5),
  ],
  "OCTAVE": [
    u8("minus2_oct", 0), u8("minus1_oct", 1), u8("direct", 2),
  ],
  "HEAVY OCT": [
    u8("minus2_oct", 0), u8("minus1_oct", 1), u8("direct", 2),
  ],
  "S-BEND": [
    u8("trigger", 0), lookup("pitch", 1, SBEND_PITCH), u8("rise_time", 2), u8("fall_time", 3),
  ],
  // PEDAL BEND: pitch_min/max stored as (value + 24), range −24..+24 semitones.
  "PEDAL BEND": [
    signed("pitch_min", 0, 24), signed("pitch_max", 1, 24),
    u8("pdl_pos", 2), u8("level", 3), u8("direct", 4),
  ],
  // TUNE DOWN: pitch stored as (pitch + 12), range −12..0 semitones.
  "TUNE DOWN": [
    signed("pitch", 0, 12),
  ],
  // DELAY as an FX slot type (separate from the dedicated DLY block):
  "DELAY": [
    u16be("time_ms", 0), u8("feedback", 2), u8("level", 3), u8("high_cut", 4), u8("direct", 5),
  ],
  // REVERB as an FX slot type (separate from the dedicated REV block):
  "REVERB": [
    lookup("type", 0, REV_TYPES), scaled("time_s", 1, 0.1),
    u8("pre_delay_ms", 2), u8("level", 3), u8("direct", 4),
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
const decodeFxParams = (fx: string, sub: string | null, bytes: number[]): FxParams => {
  const fields = FX_PARAM_MAPS[fx];
  if (!fields) return { unknownBytes: bytes.slice(0, 32) };

  const params = decodeFields(fields, bytes);
  if (fx === "OD/DS") params["type"] = sub ?? "";
  return params;
};

/**
 * Encode FX params back into the 251-byte hex block.
 * Always starts from `originalBytes` so unmapped positions are preserved.
 * When params contains `unknownBytes`, the original bytes are returned unchanged.
 */
const encodeFxParams = (
  fx: string,
  _sub: string | null,
  params: FxParams,
  originalBytes: number[],
): string[] => {
  if ("unknownBytes" in params) return hexFromBytes(originalBytes);

  const bytes = [...originalBytes];
  const fields = FX_PARAM_MAPS[fx];
  if (fields) encodeFields(fields, params, bytes);
  return hexFromBytes(bytes);
};

export { decodeFxType, encodeFxType, decodeFxParams, encodeFxParams };
