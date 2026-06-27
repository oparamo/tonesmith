import type { Patch, FxParams } from "./types";
import { blankPatch, newFile, writeFile } from "./tsl";

// 1/3-octave series from 20Hz to 12.5kHz (indices 0–28), then FLAT (29).
// Confirmed anchor: raw 25 = 6.3kHz (verified against real device readings).
const HIGH_CUT_MAP: Record<string, number> = {
  "20Hz": 0,   "25Hz": 1,   "31.5Hz": 2, "40Hz": 3,  "50Hz": 4,
  "63Hz": 5,   "80Hz": 6,   "100Hz": 7,  "125Hz": 8, "160Hz": 9,
  "200Hz": 10, "250Hz": 11, "315Hz": 12, "400Hz": 13, "500Hz": 14,
  "630Hz": 15, "800Hz": 16, "1kHz": 17,  "1.25kHz": 18, "1.6kHz": 19,
  "2kHz": 20,  "2.5kHz": 21, "3.15kHz": 22, "4kHz": 23,
  "5kHz": 24,  "6.3kHz": 25, "8kHz": 26, "10kHz": 27, "12.5kHz": 28, "FLAT": 29,
};

// Node name strings match CHAIN_NAMES in constants.ts (empirically validated by round-trip tests).
// FORMAT.md's node-ID table assigns different names to IDs 3–10 — the constants.ts mapping is
// authoritative because it's derived from actual device files.
const CHAINS: Record<string, string[]> = {
  "FX1>AMP>NS>DLY>REV":
    ["PFX", "FX1", "OD/DS", "NS", "AMP", "FV", "FX2", "FX3", "DLY", "REV", "INPUT", "LOOP", "OUTPUT"],
  "FX1>AMP>FX2>NS>DLY>REV":
    ["PFX", "FX1", "OD/DS", "NS", "AMP", "FX2", "FV", "FX3", "DLY", "REV", "INPUT", "LOOP", "OUTPUT"],
  "FX1>AMP>NS>REV":
    ["PFX", "FX1", "OD/DS", "NS", "AMP", "FV", "FX2", "FX3", "REV", "DLY", "INPUT", "LOOP", "OUTPUT"],
  "FX1>OD>AMP>NS>DLY>REV":
    ["PFX", "FX1", "OD/DS", "NS", "AMP", "FV", "FX2", "FX3", "DLY", "REV", "INPUT", "LOOP", "OUTPUT"],
  "FX1>OD>AMP>FX2>NS>DLY>REV":
    ["PFX", "FX1", "OD/DS", "NS", "AMP", "FX2", "FV", "FX3", "DLY", "REV", "INPUT", "LOOP", "OUTPUT"],
};

const basePatch = (name: string, chainKey = "FX1>AMP>NS>DLY>REV"): Patch => {
  const chain = CHAINS[chainKey];
  if (chain === undefined) throw new Error(`Unknown chain preset: ${chainKey}`);
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
};

const odds = (
  patch: Patch,
  type: string,
  drive: number,
  tone: number,
  level: number,
  direct = 0,
): void => {
  patch.odds.on = true;
  patch.odds.type = type;
  patch.odds.drive = drive;
  patch.odds.tone = tone;
  patch.odds.level = level;
  patch.odds.direct = direct;
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
  block.params = params;
};

const ns = (patch: Patch, threshold: number, release: number, on = true): void => {
  patch.ns.on = on;
  patch.ns.threshold = threshold;
  patch.ns.release = release;
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
  Object.assign(patch.delay, extra);
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
  Object.assign(patch.reverb, extra);
};

const saveTsl = (patches: Patch[], setName: string, outPath: string): void => {
  const file = newFile(setName, 0);
  file.patches = patches;
  writeFile(file, outPath);
  console.info(`Saved ${outPath} (${patches.length} patches)`);
};

export { HIGH_CUT_MAP, CHAINS, basePatch, amp, odds, clearOdds, fx, ns, delay, reverb, saveTsl };
