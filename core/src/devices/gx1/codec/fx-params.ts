import {
  FX_TYPES, FX_TYPE_IDX, ODDS_TYPES,
  WAH_TYPES, ROTARY_SPEED, FB_MODE, HUM_VOWELS, HUM_MODES,
  SBEND_PITCH, SLICER_PAT, HARMONIST_HR,
  FX_DLY_TYPES, FX_REV_TYPES, TWIST_MODES, PHASER_STAGES,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, CHORUS_TYPES, VIBE_MODES,
  FREQ_STEPS, FREQ_HIGH_CUT, FREQ_LOW_CUT, ENHANCER_LOW_FREQ, ENHANCER_HIGH_FREQ, TIME_NOTE_VALUES,
} from "../common";
import type { BlockParams } from "../types";
import { hexFromBytes, byteAt, lookupName, lookupIndex } from "./primitives";
import {
  u8, signed, lookup, bool, scaled, nibblePair, nibbleQuad, namedAbove, syncedTime, syncedRate,
  decodeFields, encodeFields, type FieldCodec,
} from "./fields";

// ── FX type encode / decode ───────────────────────────────────────────────────
//
// FX_COM byte 2 is always the bass-mode type mirror, never a subtype. See
// PARAM_SUBTYPE_EFFECTS in common/constants.ts for where each effect's own
// sub-model selector actually lives (the FX param block itself).

const decodeFxType = (hi: number): string => lookupName(FX_TYPES, hi, "FX");

const encodeFxType = (fxName: string): number => lookupIndex(FX_TYPE_IDX, fxName, "FX type");


// ── FX parameter field maps ───────────────────────────────────────────────────
//
// Each key maps an FX type name to an ordered list of FieldCodec descriptors. One table
// drives both decode (bytes → params) and encode (params → bytes).
//
// Byte offsets are 0-based within the per-slot FX param block (the 251-byte block
// stored under MEMORY%FX1 / FX2 / FX3). Unmapped byte positions come from the original
// bytes and pass through unchanged on round-trip.

const WAH_FILTER   = ["LPF", "BPF", "HPF"] as const;
const WAH_POLARITY = ["DOWN", "UP"] as const;
const PITCH_SHIFT_MODES = ["FAST", "MEDIUM", "SLOW", "MONO"] as const;

// PITCH SHIFT's "pitch" byte is a raw index into a 51-entry table: indices 0 and 50 are
// named dual-voice presets, indices 1-49 are semitones -24..+24 (index-25).
const PITCH_SHIFT_PITCH_TABLE: readonly (string | number)[] = [
  "+7&-5", ...Array.from({ length: 49 }, (_, i) => i - 24), "+12&-5",
];

/** A field whose raw byte is an index into a fixed table of mixed string/number values. */
const indexTable = (name: string, offset: number, table: readonly (string | number)[]): FieldCodec => ({
  name,
  kind: "indexTable",
  table,
  decode: bytes => {
    const index = byteAt(bytes, offset, name);
    return table[index] ?? `UNKNOWN_${name}${index}`;
  },
  encode: (value, bytes) => {
    const index = table.indexOf(value as string | number);
    if (index < 0) throw new Error(`Unknown ${name} value: ${JSON.stringify(value)}`);
    bytes[offset] = index;
  },
});

// Byte offset where each type's param block begins within the 251-byte FX block. OVERTONE is the
// exception: its 5 bytes are the whole of MEMORY%FX3A, so offset 0 there is its own block rather
// than a window into a shared one.
const FX_PARAM_OFFSETS: Partial<Record<string, number>> = {
  "OVERTONE":     0,
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
  // COMPRESSOR: p[0]=subType (stored in param block, NOT FX_COM byte[2]),
  // p[1]=sustain, p[2]=attack, p[3]=level.
  "COMPRESSOR": [
    lookup("subType", 0, COMP_TYPES), u8("sustain", 1), u8("attack", 2), u8("level", 3),
  ],
  // LIMITER: p[0]=subType (stored in param block), then params shifted by one.
  "LIMITER": [
    lookup("subType", 0, LIM_TYPES),
    u8("threshold", 1), u8("ratio", 2), u8("level", 3), u8("attack", 4), u8("release", 5),
  ],
  "SLOW GEAR": [
    u8("sens", 0), u8("riseTime", 1), u8("level", 2),
  ],
  "ENHANCER": [
    u8("sens", 0), u8("low", 1), u8("high", 2),
    lookup("lowFreq", 3, ENHANCER_LOW_FREQ), lookup("highFreq", 4, ENHANCER_HIGH_FREQ), u8("level", 5),
  ],
  "SLICER": [
    lookup("pattern", 0, SLICER_PAT),
    syncedRate("rate", 1), u8("level", 2), u8("attack", 3), signed("duty", 4, -1), u8("direct", 5),
  ],
  "PARA. EQ": [
    signed("lowGain", 0, 20), signed("highGain", 1, 20), signed("level", 2, 20),
    lookup("midFreq", 3, FREQ_STEPS), signed("midGain", 4, 20),
    lookup("lowCut", 5, FREQ_LOW_CUT), lookup("highCut", 6, FREQ_HIGH_CUT),
  ],
  // GEQ band gains use signed(center=20), so each band covers ±20 dB.
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
  // All bands and level use signed(center=20). Band order: standard frequency order.
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
    u8("freq", 1), syncedRate("rate", 2), u8("depth", 3), u8("reso", 4), u8("level", 5),
  ],
  "DEFRETTER": [
    u8("sens", 0), u8("attack", 1), u8("depth", 2), u8("reso", 3),
    signed("tone", 4), u8("level", 5), u8("direct", 6),
  ],
  // FIXED WAH: byte +1 is the bass-mode wah type, not used in guitar mode.
  "FIXED WAH": [
    lookup("subType", 0, WAH_TYPES), u8("level", 2), u8("direct", 3), u8("manual", 4),
  ],
  "AC. GTR SIM": [
    signed("high", 0), u8("body", 1), signed("low", 2), u8("level", 3),
  ],
  // AC RESO: p[0]=subType (stored in param block), then params shifted by one.
  "AC RESO": [
    lookup("subType", 0, ACRESO_TYPES),
    u8("reso", 1), signed("tone", 2), u8("level", 3),
  ],
  "FEEDBACKER": [
    lookup("mode", 0, FB_MODE), bool("trigger", 1), u8("depth", 2), u8("riseTime", 3),
    u8("octRiseTm", 4), u8("feedback", 5), u8("octFeedback", 6),
  ],
  "SITAR SIM": [
    u8("sens", 0), u8("depth", 1), signed("tone", 2), u8("level", 3),
    u8("reso", 4), u8("buzz", 5), u8("direct", 6),
  ],
  // OD/DS: p[0]=subType (stored in param block, like COMPRESSOR/LIMITER/etc.), then params
  // shifted by one. solo/soloLevel are this FX-slot instance's own solo boost, distinct
  // from the dedicated MEMORY%ODDS block's solo (the device exposes "FX1 SOLO"/"FX2
  // SOLO"/"FX3 SOLO" as separate footswitch functions from "OD/DS SOLO").
  "OD/DS": [
    lookup("subType", 0, ODDS_TYPES),
    u8("drive", 1), signed("tone", 2), u8("level", 3), u8("direct", 4),
    bool("solo", 5), u8("soloLevel", 6),
  ],
  // OVERTONE: FX3-only, stored in the separate 5-byte MEMORY%FX3A block rather than
  // the 251-byte FX3 block (see the FX3A handling in patch.ts). Offset 0 here refers
  // to FX3A's own byte 0, not the shared FX param block.
  "OVERTONE": [
    u8("lower", 0), u8("upper", 1), u8("unison", 2), u8("direct", 3), u8("detune", 4),
  ],
  // CHORUS: p[0]=subType (stored in param block), then params shifted by one.
  // preDelay stored as index × 0.5ms (e.g. 8 → 4.0ms).
  "CHORUS": [
    lookup("subType", 0, CHORUS_TYPES),
    syncedRate("rate", 1), u8("depth", 2), u8("level", 3), scaled("preDelay", 4, 0.5), u8("direct", 5),
  ],
  "FLANGER": [
    syncedRate("rate", 0), u8("depth", 1), u8("reso", 2), u8("manual", 3), u8("level", 4), u8("direct", 5),
  ],
  // PHASER: p[0] selects the stage count as a plain enum (raw 0/1/2 = 4/8/12 STAGE).
  "PHASER": [
    lookup("stage", 0, PHASER_STAGES),
    syncedRate("rate", 1), u8("depth", 2), u8("reso", 3), u8("manual", 4), u8("level", 5), u8("direct", 6),
  ],
  "SCRIPT PH": [
    syncedRate("rate", 0), u8("depth", 1), u8("level", 2),
  ],
  // CLASSIC-VIBE: p[0]=subType (stored in param block), then params shifted by one. The device's
  // own table labels it MODE; it is a sub-model here because its two values are named variants
  // worth describing, which is what decides the difference (see CLAUDE.md's Conventions).
  "CLASSIC-VIBE": [
    lookup("subType", 0, VIBE_MODES),
    syncedRate("rate", 1), u8("depth", 2), u8("level", 3),
  ],
  "ROTARY": [
    lookup("speed", 0, ROTARY_SPEED),
    syncedRate("slowRate", 1), syncedRate("fastRate", 2), u8("level", 3),
    u8("balance", 4), u8("drive", 5), u8("direct", 6),
  ],
  "VIBRATO": [
    syncedRate("rate", 0), u8("depth", 1), u8("riseTime", 2), bool("trigger", 3), u8("level", 4),
  ],
  "TREMOLO": [
    syncedRate("rate", 0), u8("depth", 1), u8("level", 2),
  ],
  "PAN": [
    syncedRate("rate", 0), u8("depth", 1), u8("level", 2),
  ],
  "RING MOD": [
    bool("intelligent", 0),
    u8("freq", 1), syncedRate("modRate", 2), u8("modDepth", 3), u8("level", 4), u8("direct", 5),
  ],
  // HUMANIZER: p[0]=subType (stored in param block), then params shifted by one. Labeled MODE by
  // the device, a sub-model here for the same reason as CLASSIC-VIBE above.
  "HUMANIZER": [
    lookup("subType", 0, HUM_MODES),
    lookup("vowel1", 1, HUM_VOWELS), lookup("vowel2", 2, HUM_VOWELS),
    u8("sens", 3), syncedRate("rate", 4), u8("manual", 5), u8("level", 6),
  ],
  // PITCH SHIFT: preDelay is a 16-bit value across 4 bytes (max ~300ms), not a plain u8.
  "PITCH SHIFT": [
    lookup("mode", 0, PITCH_SHIFT_MODES), indexTable("pitch", 1, PITCH_SHIFT_PITCH_TABLE),
    namedAbove(nibbleQuad("preDelay", 2), 300, TIME_NOTE_VALUES),
    u8("level", 6), u8("feedback", 7), u8("direct", 8),
  ],
  // HARMONIST: preDelay is a 16-bit value across 4 bytes, same as PITCH SHIFT.
  "HARMONIST": [
    lookup("harmony", 0, HARMONIST_HR),
    namedAbove(nibbleQuad("preDelay", 1), 300, TIME_NOTE_VALUES),
    u8("level", 5), u8("feedback", 6), u8("direct", 7),
  ],
  "OCTAVE": [
    u8("minus1Oct", 0), u8("minus2Oct", 1), u8("direct", 2),
  ],
  "HEAVY OCT": [
    u8("minus1Oct", 0), u8("minus2Oct", 1), u8("direct", 2),
  ],
  "S-BEND": [
    bool("trigger", 0), lookup("pitch", 1, SBEND_PITCH), u8("riseTime", 2), u8("fallTime", 3),
  ],
  // PEDAL BEND: pitchMin/pitchMax stored as (value + 24), range -24..+24 semitones.
  "PEDAL BEND": [
    signed("pitchMin", 0, 24), signed("pitchMax", 1, 24),
    u8("pdlPos", 2), u8("level", 3), u8("direct", 4),
  ],
  // TUNE DOWN: pitch stored as (pitch + 12), range -12..0 semitones.
  "TUNE DOWN": [
    signed("pitch", 0, 12),
  ],
  // DELAY as an FX slot type is per-sub-algorithm; see FX_DELAY_TYPE_MAPS below.
  // REVERB as an FX slot type (separate from the dedicated REV block). Its 5 types are
  // its own set (HALL S/HALL M/PLATE/ROOM/STUDIO, NOT the dedicated block's REV_TYPES),
  // and all 5 share this one field set, so it stays a single flat map.
  "REVERB": [
    lookup("subType", 0, FX_REV_TYPES), scaled("time", 1, 0.1),
    nibblePair("preDelay", 2), u8("level", 4), u8("direct", 5),
  ],
};

// FX-slot DELAY is the one FX type whose param set depends on the selected sub-algorithm, so
// like the dedicated DLY block it is modeled per-subtype rather than with one flat
// map. Offsets are 0-based within the DELAY param block (FX_PARAM_OFFSETS["DELAY"]); every
// sub-algorithm's byte homes are distinct (no offset reuse), verified against the device's
// address table. p[0] is promoted to block.subType via PARAM_SUBTYPE_EFFECTS.
const FX_DELAY_TYPE_MAPS: Record<string, FieldCodec[]> = {
  "STANDARD": [
    lookup("subType", 0, FX_DLY_TYPES), syncedTime("time", 1),
    u8("feedback", 5), u8("level", 6), lookup("highCut", 7, FREQ_HIGH_CUT),
  ],
  "MODULATE": [
    lookup("subType", 0, FX_DLY_TYPES), syncedTime("time", 1),
    u8("feedback", 5), u8("level", 6), lookup("highCut", 7, FREQ_HIGH_CUT),
    u8("modRate", 8), u8("modDepth", 9),
  ],
  "WARP": [
    lookup("subType", 0, FX_DLY_TYPES), syncedTime("time", 1),
    bool("trigger", 11), u8("level", 12),
  ],
  "TWIST": [
    lookup("subType", 0, FX_DLY_TYPES), lookup("mode", 10, TWIST_MODES), bool("trigger", 11),
    u8("riseTime", 13), u8("fallTime", 14), u8("fadeTime", 15), u8("level", 12),
  ],
  "GLITCH": [
    lookup("subType", 0, FX_DLY_TYPES), bool("trigger", 11),
    u8("time", 16), u8("glitch", 17), u8("balance", 18),
  ],
};


// ── Public decode / encode ────────────────────────────────────────────────────

/** The one FX type that selects its field map by sub-algorithm rather than having one flat map. */
const PER_SUB_ALGORITHM_TYPE = "DELAY";

const fieldMapFor = (fxType: string, delaySubType: string): FieldCodec[] | undefined => {
  if (fxType === PER_SUB_ALGORITHM_TYPE) return FX_DELAY_TYPE_MAPS[delaySubType];
  return FX_PARAM_MAPS[fxType];
};

const unmappedTypeMessage = (fxType: string, delaySubType: string): string => {
  if (fxType !== PER_SUB_ALGORITHM_TYPE) return `FX type "${fxType}" has no param layout to write to`;
  return `Unknown DELAY subType: "${delaySubType}". Expected one of: ${FX_DLY_TYPES.join(", ")}`;
};

/**
 * Decodes the 251-byte FX parameter block for a given effect type. A type this codec has no field
 * map for reads as no params at all; its bytes are still in the block, which is what the encoder
 * writes back.
 */
const decodeFxParams = (fxType: string, bytes: number[]): BlockParams => {
  const offset = FX_PARAM_OFFSETS[fxType] ?? 0;
  const paramBytes = bytes.slice(offset);
  const subAlgo = lookupName(FX_DLY_TYPES, byteAt(paramBytes, 0, `${fxType} params`));
  const fields = fieldMapFor(fxType, subAlgo);
  if (!fields) return {};

  return decodeFields(fields, paramBytes);
};

/**
 * Encodes FX params back into the 251-byte hex block, always starting from `originalBytes` so
 * unmapped positions survive. A type with no field map has nowhere to put params, so it keeps
 * those bytes when there are none to place and throws when there are: writing nothing and
 * reporting success is how an edit goes missing.
 */
const encodeFxParams = (
  fxType: string,
  params: BlockParams,
  originalBytes: number[],
): string[] => {
  const bytes = [...originalBytes];
  const delaySubType = typeof params.subType === "string" ? params.subType : "";
  const fields = fieldMapFor(fxType, delaySubType);
  const offset = FX_PARAM_OFFSETS[fxType];
  if (fields === undefined || offset === undefined) {
    if (Object.keys(params).length === 0) return hexFromBytes(originalBytes);
    throw new Error(unmappedTypeMessage(fxType, delaySubType));
  }

  const paramBytes = bytes.slice(offset);
  encodeFields(fields, params, paramBytes);
  bytes.splice(offset, paramBytes.length, ...paramBytes);
  return hexFromBytes(bytes);
};

export { decodeFxType, encodeFxType, decodeFxParams, encodeFxParams, FX_PARAM_MAPS, FX_DELAY_TYPE_MAPS };
