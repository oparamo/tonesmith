import type { Patch, FxParams } from "./types/index.js";
import { blankPatch, newFile, writeFile } from "./tsl.js";

const HIGH_CUT_MAP: Record<string, number> = {
  "2.2kHz": 20, "2.5kHz": 21, "2.8kHz": 22, "3.0kHz": 23,
  "3.15kHz": 24, "3.2kHz": 24, "3.5kHz": 25, "4.0kHz": 26,
  "4.5kHz": 27, "5.0kHz": 28, "FLAT": 29,
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
  const p = blankPatch(name);
  p.chain = chain;
  return p;
};

const amp = (
  p: Patch,
  type: string,
  gain: number,
  bass: number,
  mid: number,
  treble: number,
  speaker = "ORIGINAL",
  mic = "DYN57",
  level = 100,
): void => {
  p.amp.on = true;
  p.amp.type = type;
  p.amp.gain = gain;
  p.amp.bass = bass;
  p.amp.middle = mid;
  p.amp.treble = treble;
  p.amp.speaker = speaker;
  p.amp.mic = mic;
  p.amp.level = level;
};

const odds = (
  p: Patch,
  type: string,
  drive: number,
  tone: number,
  level: number,
  direct = 0,
): void => {
  p.odds.on = true;
  p.odds.type = type;
  p.odds.drive = drive;
  p.odds.tone = tone;
  p.odds.level = level;
  p.odds.direct = direct;
};

const clearOdds = (p: Patch): void => {
  p.odds.on = false;
};

const fx = (
  p: Patch,
  slot: "fx1" | "fx2" | "fx3",
  fxType: string,
  subtype: string | null = null,
  params: FxParams = {},
): void => {
  const block = p[slot];
  block.on = true;
  block.type = fxType;
  block.subtype = subtype;
  block.params = params;
};

const ns = (p: Patch, threshold: number, release: number, on = true): void => {
  p.ns.on = on;
  p.ns.threshold = threshold;
  p.ns.release = release;
};

const delay = (
  p: Patch,
  type: string,
  timeMs: number,
  feedback: number,
  level: number,
  highCutStr = "FLAT",
  on = true,
  extra: Record<string, unknown> = {},
): void => {
  const hc = HIGH_CUT_MAP[highCutStr] ?? 29;
  p.delay.on = on;
  p.delay.type = type;
  p.delay.time_ms = timeMs;
  p.delay.feedback = feedback;
  p.delay.level = level;
  p.delay.high_cut = hc;
  Object.assign(p.delay, extra);
};

const reverb = (
  p: Patch,
  type: string,
  timeS: number,
  level: number,
  preDelayMs = 0,
  tone = 0,
  density = 5,
  direct = 100,
  on = true,
  extra: Record<string, unknown> = {},
): void => {
  p.reverb.on = on;
  p.reverb.type = type;
  p.reverb.time_s = timeS;
  p.reverb.level = level;
  p.reverb.pre_delay_ms = preDelayMs;
  p.reverb.tone = tone;
  p.reverb.density = density;
  p.reverb.direct = direct;
  Object.assign(p.reverb, extra);
};

const saveTsl = (patches: Patch[], setName: string, outPath: string): void => {
  const file = newFile(setName, 0);
  file.patches = patches;
  writeFile(file, outPath);
  console.info(`Saved ${outPath} (${patches.length} patches)`);
};

export { HIGH_CUT_MAP, CHAINS, basePatch, amp, odds, clearOdds, fx, ns, delay, reverb, saveTsl };
