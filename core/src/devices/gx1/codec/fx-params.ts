import {
  FX_TYPES, FX_TYPE_IDX, ODDS_TYPES,
  WAH_TYPES, ROTARY_SPEED, FB_MODE, RING_INTL, HUM_VOWELS, HUM_MODES,
  SBEND_PITCH, SLICER_PAT, HARMONIST_HR,
  DLY_TYPES, REV_TYPES, ON_OFF,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, CHORUS_TYPES, VIBE_MODES,
} from "../common";
import type { FxParams } from "../types";
import { hexFromBytes, lookupName, lookupIndex } from "./primitives";
import { u8, signed, lookup, scaled, nibblePair, nibbleQuad, decodeFields, encodeFields, type FieldCodec } from "./fields";

// ── FX type encode / decode ───────────────────────────────────────────────────
//
// FX_COM byte 2 is always the bass-mode type mirror, never a subtype — see
// PARAM_SUBTYPE_EFFECTS in common/constants.ts for where each effect's own
// sub-model selector actually lives (the FX param block itself).

/** Decode the FX_COM type byte into a name. Falls back to "UNKNOWN_N" if out of range. */
const decodeFxType = (hi: number): string => lookupName(FX_TYPES, hi, "FX");

/** Encode an FX type name back to its FX_COM type byte. */
const encodeFxType = (fxName: string): number => lookupIndex(FX_TYPE_IDX, fxName, "FX type");


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
const PITCH_SHIFT_MODES = ["FAST", "MEDIUM", "SLOW", "MONO"] as const;

// PITCH SHIFT's "pitch" byte: raw index into a 51-entry table — index 0 and 50 are
// named dual-voice presets, indices 1-49 are semitones -24..+24 (index-25).
const PITCH_SHIFT_PITCH_TABLE: readonly (string | number)[] = [
  "+7&-5", ...Array.from({ length: 49 }, (_, i) => i - 24), "+12&-5",
];

/** A field whose raw byte is an index into a fixed table of mixed string/number values. */
const indexTable = (name: string, offset: number, table: readonly (string | number)[]): FieldCodec => ({
  name,
  decode: bytes => table[bytes[offset]!]!,
  encode: (value, bytes) => {
    const index = table.indexOf(value as string | number);
    if (index < 0) throw new Error(`Unknown ${name} value: ${JSON.stringify(value)}`);
    bytes[offset] = index;
  },
});

// Byte offset where each type's param block begins within the 251-byte FX block.
const FX_PARAM_OFFSETS: Partial<Record<string, number>> = {
  "COMPRESSOR":   0,
  "LIMITER":      10,
  "SLOW GEAR":    16,
  "ENHANCER":     19,
  "SLICER":       25,
  "PARA. EQ":     31,
  "GEQ":          38,
  "LOW GEQ":      45,
  "HIGH GEQ":     52,
  "TOUCH WAH":    59,
  "AUTO WAH":     67,
  "DEFRETTER":    73,
  "FIXED WAH":    85,
  "AC. GTR SIM":  93,
  "AC RESO":      97,
  "FEEDBACKER":   101,
  "SITAR SIM":    108,
  "OD/DS":        115,
  "CHORUS":       122,
  "FLANGER":      128,
  "PHASER":       134,
  "SCRIPT PH":    141,
  "CLASSIC-VIBE": 144,
  "ROTARY":       148,
  "VIBRATO":      155,
  "TREMOLO":      160,
  "PAN":          163,
  "RING MOD":     166,
  "HUMANIZER":    172,
  "PITCH SHIFT":  179,
  "HARMONIST":    188,
  "OCTAVE":       196,
  "HEAVY OCT":    199,
  "S-BEND":       202,
  "PEDAL BEND":   206,
  "TUNE DOWN":    211,
  "DELAY":        212,
  "REVERB":       231,
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
  "SLOW GEAR": [
    u8("sens", 0), u8("riseTime", 1), u8("level", 2),
  ],
  "ENHANCER": [
    u8("sens", 0), u8("low", 1), u8("high", 2),
    u8("lowFreq", 3), u8("highFreq", 4), u8("level", 5),
  ],
  "SLICER": [
    lookup("pattern", 0, SLICER_PAT),
    u8("rate", 1), u8("level", 2), u8("attack", 3), signed("duty", 4, -1), u8("direct", 5),
  ],
  // midFreq/lowCut/highCut are frequency-index numbers (indices into the same series as HIGH_CUT_MAP).
  "PARA. EQ": [
    signed("lowGain", 0, 20), signed("highGain", 1, 20), signed("level", 2, 20),
    u8("midFreq", 3), signed("midGain", 4, 20), u8("lowCut", 5), u8("highCut", 6),
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
  // All bands and level use signed(centre=20). Band order: standard frequency order.
  "HIGH GEQ": [
    signed("250Hz", 0, 20), signed("500Hz", 1, 20), signed("1kHz", 2, 20),
    signed("2kHz",  3, 20), signed("4kHz",  4, 20), signed("8kHz", 5, 20),
    signed("level", 6, 20),
  ],
  "TOUCH WAH": [
    lookup("filter", 0, WAH_FILTER), lookup("polarity", 1, WAH_POLARITY),
    u8("sens", 2), u8("freq", 3), u8("reso", 4), u8("decay", 5), u8("level", 6), u8("direct", 7),
  ],
  "AUTO WAH": [
    lookup("filter", 0, WAH_FILTER),
    u8("freq", 1), u8("rate", 2), u8("depth", 3), u8("reso", 4), u8("level", 5),
  ],
  "DEFRETTER": [
    u8("sens", 0), u8("attack", 1), u8("depth", 2), u8("reso", 3),
    signed("tone", 4), u8("level", 5), u8("direct", 6),
  ],
  // FIXED WAH: byte +1 is the bass-mode wah type — not used in guitar mode.
  "FIXED WAH": [
    lookup("wahType", 0, WAH_TYPES), u8("level", 2), u8("direct", 3), u8("manual", 4),
  ],
  "AC. GTR SIM": [
    signed("high", 0), u8("body", 1), signed("low", 2), u8("level", 3),
  ],
  // AC RESO: p[0]=type (stored in param block), then params shifted by one.
  "AC RESO": [
    lookup("type", 0, ACRESO_TYPES),
    u8("reso", 1), signed("tone", 2), u8("level", 3),
  ],
  "FEEDBACKER": [
    lookup("mode", 0, FB_MODE), u8("trigger", 1), u8("depth", 2), u8("riseTime", 3),
    u8("octRiseTm", 4), u8("feedback", 5), u8("octFeedback", 6),
  ],
  "SITAR SIM": [
    u8("sens", 0), u8("depth", 1), signed("tone", 2), u8("level", 3),
    u8("reso", 4), u8("buzz", 5), u8("direct", 6),
  ],
  // OD/DS: p[0]=type (stored in param block, like COMPRESSOR/LIMITER/etc.), then params
  // shifted by one.
  "OD/DS": [
    lookup("type", 0, ODDS_TYPES),
    u8("drive", 1), signed("tone", 2), u8("level", 3), u8("direct", 4),
  ],
  // OVERTONE: FX3-only, stored in the separate 5-byte MEMORY%FX3A block rather than
  // the 251-byte FX3 block — see the FX3A handling in patch.ts. Offset 0 here refers
  // to FX3A's own byte 0, not the shared FX param block.
  "OVERTONE": [
    u8("lower", 0), u8("upper", 1), u8("unison", 2), u8("direct", 3), u8("detune", 4),
  ],
  // CHORUS: p[0]=type (stored in param block), then params shifted by one.
  // preDelay stored as index × 0.5ms (e.g. 8 → 4.0ms).
  "CHORUS": [
    lookup("type", 0, CHORUS_TYPES),
    u8("rate", 1), u8("depth", 2), u8("level", 3), scaled("preDelay", 4, 0.5), u8("direct", 5),
  ],
  "FLANGER": [
    u8("rate", 0), u8("depth", 1), u8("reso", 2), u8("manual", 3), u8("level", 4), u8("direct", 5),
  ],
  // PHASER: stage is stored as (stage−2)/2 and recovered as bytes[0]*2+2.
  "PHASER": [
    {
      name: "stage",
      decode: bytes => bytes[0]! * 2 + 2,
      encode: (value, bytes) => { bytes[0] = ((value as number) - 2) >> 1; },
    },
    u8("rate", 1), u8("depth", 2), u8("reso", 3), u8("manual", 4), u8("level", 5), u8("direct", 6),
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
    u8("slowRate", 1), u8("fastRate", 2), u8("level", 3),
    u8("balance", 4), u8("drive", 5), u8("direct", 6),
  ],
  "VIBRATO": [
    u8("rate", 0), u8("depth", 1), u8("riseTime", 2), u8("trigger", 3), u8("level", 4),
  ],
  "TREMOLO": [
    u8("rate", 0), u8("depth", 1), u8("level", 2),
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
  // PITCH SHIFT: preDelay is a 16-bit value across 4 bytes (max ~300ms), not a plain u8.
  "PITCH SHIFT": [
    lookup("mode", 0, PITCH_SHIFT_MODES), indexTable("pitch", 1, PITCH_SHIFT_PITCH_TABLE),
    nibbleQuad("preDelay", 2), u8("level", 6), u8("feedback", 7), u8("direct", 8),
  ],
  // HARMONIST: preDelay is a 16-bit value across 4 bytes, same as PITCH SHIFT.
  "HARMONIST": [
    lookup("harmony", 0, HARMONIST_HR),
    nibbleQuad("preDelay", 1), u8("level", 5), u8("feedback", 6), u8("direct", 7),
  ],
  "OCTAVE": [
    u8("minus1Oct", 0), u8("minus2Oct", 1), u8("direct", 2),
  ],
  "HEAVY OCT": [
    u8("minus1Oct", 0), u8("minus2Oct", 1), u8("direct", 2),
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
  // DELAY as an FX slot type (separate from the dedicated DLY block). Only the first
  // 5 DLY_TYPES entries (STANDARD/MODULATE/PAN/REVERSE/ANALOG) are reachable here —
  // WARP/TWIST/GLITCH are dedicated-block-only.
  "DELAY": [
    lookup("type", 0, DLY_TYPES), nibbleQuad("time", 1),
    u8("feedback", 5), u8("level", 6), u8("highCut", 7),
    u8("modRate", 8), u8("modDepth", 9), lookup("trigger", 11, ON_OFF),
  ],
  // REVERB as an FX slot type (separate from the dedicated REV block). Only the first
  // 5 REV_TYPES entries (HALL S/HALL M/PLATE/ROOM S/ROOM L) are reachable here.
  "REVERB": [
    lookup("type", 0, REV_TYPES), scaled("time", 1, 0.1),
    nibblePair("preDelay", 2), u8("level", 4), u8("direct", 5),
  ],
};


// ── Public decode / encode ────────────────────────────────────────────────────

/**
 * Decode the 251-byte FX parameter block for a given effect type.
 *
 * Returns a typed params object for known types. For unrecognised types, returns
 * `{ unknownBytes: rawBytes }` so the round-trip encoder can preserve the original
 * bytes unchanged without data loss.
 */
const decodeFxParams = (fxType: string, bytes: number[]): FxParams => {
  const fields = FX_PARAM_MAPS[fxType];
  if (!fields) return { unknownBytes: bytes.slice(0, 32) };

  const offset = FX_PARAM_OFFSETS[fxType] ?? 0;
  return decodeFields(fields, offset > 0 ? bytes.slice(offset) : bytes);
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
