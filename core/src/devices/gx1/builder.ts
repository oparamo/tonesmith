import type { Patch, FxParams } from "./types";
import { blankPatch, newFile, writeFile } from "./tsl";
import { PARAM_SUBTYPE_EFFECTS, NS_DETECT } from "./common";
import { DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS, type FieldCodec } from "./codec";

// 1/3-octave series from 20Hz to 12.5kHz (indices 0–28), then FLAT (29).
const HIGH_CUT_MAP: Record<string, number> = {
  "20Hz": 0,   "25Hz": 1,   "31.5Hz": 2, "40Hz": 3,  "50Hz": 4,
  "63Hz": 5,   "80Hz": 6,   "100Hz": 7,  "125Hz": 8, "160Hz": 9,
  "200Hz": 10, "250Hz": 11, "315Hz": 12, "400Hz": 13, "500Hz": 14,
  "630Hz": 15, "800Hz": 16, "1kHz": 17,  "1.25kHz": 18, "1.6kHz": 19,
  "2kHz": 20,  "2.5kHz": 21, "3.15kHz": 22, "4kHz": 23,
  "5kHz": 24,  "6.3kHz": 25, "8kHz": 26, "10kHz": 27, "12.5kHz": 28, "FLAT": 29,
};

// Same 1/3-octave series as HIGH_CUT_MAP, but FLAT (0) comes first and the
// frequencies ascend from there — used by PARA. EQ's lowCut field.
const LOW_CUT_MAP: Record<string, number> = {
  "FLAT": 0,   "20Hz": 1,   "25Hz": 2,   "31.5Hz": 3, "40Hz": 4,  "50Hz": 5,
  "63Hz": 6,   "80Hz": 7,   "100Hz": 8,  "125Hz": 9,  "160Hz": 10, "200Hz": 11,
  "250Hz": 12, "315Hz": 13, "400Hz": 14, "500Hz": 15, "630Hz": 16, "800Hz": 17,
  "1kHz": 18,  "1.25kHz": 19, "1.6kHz": 20, "2kHz": 21, "2.5kHz": 22,
  "3.15kHz": 23, "4kHz": 24, "5kHz": 25, "6.3kHz": 26, "8kHz": 27,
  "10kHz": 28, "12.5kHz": 29,
};

// The 10 reorderable blocks — OUTPUT is a fixed endpoint, not part of the chain array
// (see CHAIN_BLOCK_ORDER in common/constants.ts for the underlying byte encoding).
const DEFAULT_CHAIN: string[] =
  ["PFX", "FX1", "OD/DS", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"];

/** Returns a new chain array with `node` relocated to sit immediately before `beforeNode`. */
const moveBefore = (chain: string[], node: string, beforeNode: string): string[] => {
  const without = chain.filter(n => n !== node);
  const index = without.indexOf(beforeNode);
  if (index < 0) throw new Error(`moveBefore: ${beforeNode} not found in chain`);
  return [...without.slice(0, index), node, ...without.slice(index)];
};

const basePatch = (name: string, chain: string[] = DEFAULT_CHAIN): Patch => {
  const patch = blankPatch(name);
  patch.chain = chain;
  return patch;
};

const amp = (
  patch: Patch,
  type: string,
  gain: number,
  bass: number,
  mid: number,
  treble: number,
  speaker = "ORIGINAL",
  mic = "DYN57",
  level = 100,
  solo = false,
  soloLevel = 50,
): void => {
  patch.amp.on = true;
  patch.amp.type = type;
  patch.amp.gain = gain;
  patch.amp.bass = bass;
  patch.amp.middle = mid;
  patch.amp.treble = treble;
  patch.amp.speaker = speaker;
  patch.amp.mic = mic;
  patch.amp.level = level;
  patch.amp.solo = solo;
  patch.amp.soloLevel = soloLevel;
};

const odds = (
  patch: Patch,
  type: string,
  drive: number,
  tone: number,
  level: number,
  direct = 0,
  solo = false,
  soloLevel = 50,
): void => {
  patch.odds.on = true;
  patch.odds.type = type;
  patch.odds.drive = drive;
  patch.odds.tone = tone;
  patch.odds.level = level;
  patch.odds.direct = direct;
  patch.odds.solo = solo;
  patch.odds.soloLevel = soloLevel;
};

const clearOdds = (patch: Patch): void => {
  patch.odds.on = false;
};

const fx = (
  patch: Patch,
  slot: "fx1" | "fx2" | "fx3",
  fxType: string,
  subType: string | null = null,
  params: FxParams = {},
): void => {
  const block = patch[slot];
  block.on = true;
  block.type = fxType;
  block.subType = subType;
  // For effects whose sub-model lives in param-block byte p[0] (not FX_COM byte[2]),
  // the encoder reads it from params.type, not block.subType — thread it through here
  // so callers can keep passing subType positionally without knowing that distinction.
  block.params =
    subType != null && PARAM_SUBTYPE_EFFECTS.has(fxType) && params["type"] === undefined
      ? { ...params, type: subType }
      : params;
};

const ns = (patch: Patch, threshold: number, release: number, on = true, detect: string = NS_DETECT[0]): void => {
  patch.ns.on = on;
  patch.ns.threshold = threshold;
  patch.ns.release = release;
  patch.ns.detect = detect;
};

const fv = (patch: Patch, position: number, min: number, max: number, curve = "NORMAL"): void => {
  patch.fv.position = position;
  patch.fv.min = min;
  patch.fv.max = max;
  patch.fv.curve = curve;
};

/**
 * Merges `extra` into `target`, rejecting any key that isn't one of `fields`'
 * names — a typo'd or type-mismatched extra param would otherwise write a byte
 * offset that's meaningless for the current type and silently corrupt an
 * unrelated field on encode. Shared by pfx/delay/reverb, whose field sets vary by type.
 */
const assignExtra = (
  target: Record<string, unknown>,
  extra: Record<string, unknown>,
  fields: FieldCodec[] | undefined,
  blockLabel: string,
  type: string,
): void => {
  const validNames = new Set((fields ?? []).map(f => f.name));
  for (const key of Object.keys(extra)) {
    if (!validNames.has(key)) {
      throw new Error(`${blockLabel} extra param "${key}" is not valid for type "${type}"`);
    }
  }
  Object.assign(target, extra);
};

/** Sets the expression pedal effect: "WAH" (wahType/level/direct/position/min/max) or "PEDAL BEND" (pitchMin/pitchMax/position/level/direct). */
const pfx = (patch: Patch, type: string, params: Record<string, unknown> = {}, on = true): void => {
  patch.pfx.on = on;
  patch.pfx.type = type;
  assignExtra(patch.pfx, params, PFX_TYPE_MAPS[type], "pfx", type);
};

const delay = (
  patch: Patch,
  type: string,
  time: number,
  feedback: number,
  level: number,
  highCutStr = "FLAT",
  on = true,
  extra: Record<string, unknown> = {},
): void => {
  const highCut = HIGH_CUT_MAP[highCutStr] ?? 29;
  patch.delay.on = on;
  patch.delay.type = type;
  patch.delay.time = time;
  patch.delay.feedback = feedback;
  patch.delay.level = level;
  patch.delay.highCut = highCut;
  assignExtra(patch.delay, extra, DELAY_TYPE_MAPS[type], "delay", type);
};

const reverb = (
  patch: Patch,
  type: string,
  time: number,
  level: number,
  preDelay = 0,
  tone = 0,
  density = 5,
  direct = 100,
  on = true,
  extra: Record<string, unknown> = {},
): void => {
  patch.reverb.on = on;
  patch.reverb.type = type;
  patch.reverb.time = time;
  patch.reverb.level = level;
  patch.reverb.preDelay = preDelay;
  patch.reverb.tone = tone;
  patch.reverb.density = density;
  patch.reverb.direct = direct;
  const fields = (STANDARD_REVERB_TYPES as readonly string[]).includes(type)
    ? REV_TYPE_MAPS["STANDARD"]
    : REV_TYPE_MAPS[type];
  assignExtra(patch.reverb, extra, fields, "reverb", type);
};

const saveTsl = (patches: Patch[], setName: string, outPath: string): void => {
  const file = newFile(setName, 0);
  file.patches = patches;
  writeFile(file, outPath);
  console.info(`Saved ${outPath} (${patches.length} patches)`);
};

export { HIGH_CUT_MAP, LOW_CUT_MAP, DEFAULT_CHAIN, moveBefore, basePatch, amp, odds, clearOdds, fx, ns, fv, pfx, delay, reverb, saveTsl };
