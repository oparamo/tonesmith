/**
 * Real per-type factory defaults for every GX-1 block/type, lifted from `default-init.tsl`'s
 * shadow bytes (the union byte region where every type of a block coexists; see FORMAT.md).
 * This is the single source of default field values: the builder fills any param the caller
 * doesn't set from here, so a fresh block gets the device's own factory value instead of a
 * generic guess. Kept honest by the drift guard in `tests/devices/gx1/defaults.test.ts`, which
 * re-harvests the same data from the fixture and asserts equality.
 *
 * Keys are codec field names (the decoded `key`), values are the decoded defaults. The block-level
 * `on`/`type` selectors are omitted (set separately by the builder). fx type param windows don't
 * overlap, so every fx/fxDelay default is exactly the device's factory value; delay/reverb types
 * share some byte offsets, but those shared fields are exactly the builder's positional "covered"
 * fields, so the harvest is only consulted for each type's own (unshared) fields, where it holds.
 *
 * Regenerate after a fixture change: see `tests/devices/gx1/defaults.test.ts`.
 */
type ParamDefaults = Record<string, string | number | boolean>;
type BlockDefaults = Record<string, ParamDefaults>;

interface DefaultsByType {
  fx: BlockDefaults;
  fxDelay: BlockDefaults;
  delay: BlockDefaults;
  reverb: BlockDefaults;
  pfx: BlockDefaults;
}

const DEFAULTS_BY_TYPE: DefaultsByType = {
  fx: {
    "COMPRESSOR": { sustain: 50, attack: 50, level: 60 },
    "LIMITER": { threshold: 30, ratio: 10, level: 25, attack: 50, release: 50 },
    "ENHANCER": { sens: 50, low: 50, high: 50, lowFreq: "63Hz", highFreq: "2kHz", level: 100 },
    "TOUCH WAH": { filter: "BPF", polarity: "UP", sens: 50, freq: 30, reso: 70, decay: 85, level: 100, direct: 0 },
    "AUTO WAH": { filter: "BPF", freq: 50, rate: 50, depth: 50, reso: 50, level: 100 },
    "FIXED WAH": { level: 100, direct: 0, manual: 50 },
    "DEFRETTER": { sens: 50, attack: 70, depth: 0, reso: 50, tone: 0, level: 100, direct: 0 },
    "SLOW GEAR": { sens: 50, riseTime: 50, level: 50 },
    "AC. GTR SIM": { high: 0, body: 50, low: 0, level: 50 },
    "AC RESO": { reso: 50, tone: 0, level: 50 },
    "SITAR SIM": { sens: 50, depth: 50, tone: 0, level: 100, reso: 32, buzz: 40, direct: 0 },
    "FEEDBACKER": { mode: "NORMAL", trigger: false, depth: 50, riseTime: 70, octRiseTm: 85, feedback: 50, octFeedback: 30 },
    "OD/DS": { drive: 50, tone: 0, level: 50, direct: 0, solo: false, soloLevel: 50 },
    "PARA. EQ": { lowGain: 0, highGain: 0, level: 0, midFreq: "4kHz", midGain: 0, lowCut: "FLAT", highCut: "FLAT" },
    "GEQ": { "125Hz": 0, "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 0, level: 0 },
    "LOW GEQ": { "63Hz": 0, "125Hz": 0, "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, level: 0 },
    "HIGH GEQ": { "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 0, "8kHz": 0, level: 0 },
    "CHORUS": { rate: 50, depth: 40, level: 100, preDelay: 4, direct: 100 },
    "FLANGER": { rate: 25, depth: 60, reso: 35, manual: 55, level: 100, direct: 0 },
    "PHASER": { stage: "4 STAGE", rate: 30, depth: 70, reso: 30, manual: 50, level: 100, direct: 0 },
    "SCRIPT PH": { rate: 50, depth: 50, level: 100 },
    "CLASSIC-VIBE": { rate: 50, depth: 100, level: 100 },
    "ROTARY": { speed: "SLOW", slowRate: 50, fastRate: 50, level: 100, balance: 50, drive: 0, direct: 0 },
    "VIBRATO": { rate: 80, depth: 20, riseTime: 30, trigger: true, level: 100 },
    "TREMOLO": { rate: 75, depth: 50, level: 100 },
    "SLICER": { pattern: "PATTERN 1", rate: 50, level: 100, attack: 50, duty: 50, direct: 0 },
    "PAN": { rate: 50, depth: 50, level: 100 },
    "RING MOD": { intelligent: false, freq: 50, modRate: 50, modDepth: 0, level: 100, direct: 0 },
    "HUMANIZER": { vowel1: "a", vowel2: "i", sens: 50, rate: 50, manual: 50, level: 100 },
    "PITCH SHIFT": { mode: "MEDIUM", pitch: -5, preDelay: 0, level: 100, feedback: 0, direct: 100 },
    "HARMONIST": { harmony: "+3rd", preDelay: 0, level: 100, feedback: 0, direct: 100 },
    "OCTAVE": { minus1Oct: 50, minus2Oct: 50, direct: 100 },
    "HEAVY OCT": { minus1Oct: 50, minus2Oct: 50, direct: 100 },
    "S-BEND": { trigger: false, pitch: "+2oct", riseTime: 50, fallTime: 5 },
    "PEDAL BEND": { pitchMin: 0, pitchMax: 24, pdlPos: 100, level: 100, direct: 0 },
    "TUNE DOWN": { pitch: -2 },
    "REVERB": { time: 3, preDelay: 30, level: 30, direct: 100 },
    "OVERTONE": { lower: 50, upper: 50, unison: 50, direct: 100, detune: 35 },
  },
  fxDelay: {
    "STANDARD": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz" },
    "MODULATE": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 50, modDepth: 0 },
    "WARP": { time: 400, trigger: false, level: 50 },
    "TWIST": { mode: "RISE-FALL", trigger: false, riseTime: 50, fallTime: 50, fadeTime: 50, level: 50 },
    "GLITCH": { trigger: false, time: 50, glitch: 50, balance: 100 },
  },
  delay: {
    "STANDARD": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz" },
    "MODULATE": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 50, modDepth: 30 },
    "PAN": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", tapTime: 50 },
    "REVERSE": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", trigger: true },
    "ANALOG": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz" },
    "ANLG MOD": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 50, modDepth: 30 },
    "SPACE ECHO": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", head: "1" },
    "SHIMMER": { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", pitch: 12, balance: 50 },
    "WARP": { time: 400, trigger: false, level: 50 },
    "TWIST": { mode: "RISE-FALL", trigger: false, riseTime: 50, fallTime: 50, fadeTime: 50, level: 50 },
    "GLITCH": { trigger: false, time: 50, glitch: 50, balance: 100 },
  },
  reverb: {
    "HALL S": { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 },
    "HALL M": { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 },
    "PLATE": { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 },
    "ROOM S": { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 },
    "ROOM L": { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 },
    "AMBIENCE": { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 },
    "SPRING": { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 },
    "SHIMMER": { time: 2.6, tone: 0, level: 25, preDelay: 30, pitch: 12, pitchLevel: 100 },
    "SUB DELAY": { time: 400, level: 50, feedback: 30, highCut: "6.3kHz" },
    "TERA ECHO": { tone: 0, level: 25, direct: 100, feedback: 30, spreadTime: 50, trigger: false },
  },
  pfx: {
    "WAH": { wahType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 },
    "PEDAL BEND": { pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 },
  },
};

/**
 * Factory defaults for the four blocks that have one fixed shape rather than a set of types, read
 * straight off `default-init.tsl` (no shadow region to swap through: these blocks mean the same
 * thing whatever else the patch does). The block's `on` and `type` selectors are left out, as they
 * are for the per-type blocks, since the builder sets both from what the caller asked for.
 *
 * The builder fills any control the caller doesn't set from here. Before this existed those
 * controls were required, which made a caller invent a value for every knob on a block it only
 * wanted switched on, and the ones that did have a hardcoded default disagreed with the device:
 * amp LEVEL opened at 100 against the device's 50 and amp MIC at DYN57 against DYN421.
 */
const BLOCK_DEFAULTS: Record<string, ParamDefaults> = {
  amp: { gain: 50, level: 50, bass: 50, middle: 50, treble: 50, speaker: "ORIGINAL", mic: "DYN421", solo: false, soloLevel: 50 },
  odds: { drive: 50, tone: 0, level: 50, direct: 0, solo: false, soloLevel: 50 },
  ns: { threshold: 30, release: 30, detect: "INPUT" },
  fv: { position: 100, min: 0, max: 100, curve: "NORMAL" },
};

export { DEFAULTS_BY_TYPE, BLOCK_DEFAULTS };
export type { ParamDefaults, BlockDefaults, DefaultsByType };
