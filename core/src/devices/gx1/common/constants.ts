const FX_TYPES = [
  "COMPRESSOR", "LIMITER", "ENHANCER", "TOUCH WAH", "AUTO WAH", "FIXED WAH",
  "DEFRETTER", "SLOW GEAR", "AC. GTR SIM", "AC RESO", "SITAR SIM", "FEEDBACKER",
  "OD/DS", "PARA. EQ", "GEQ", "LOW GEQ", "HIGH GEQ", "CHORUS", "FLANGER",
  "PHASER", "SCRIPT PH", "CLASSIC-VIBE", "ROTARY", "VIBRATO", "TREMOLO",
  "SLICER", "PAN", "RING MOD", "HUMANIZER", "PITCH SHIFT", "HARMONIST",
  "OCTAVE", "HEAVY OCT", "S-BEND", "PEDAL BEND", "TUNE DOWN", "DELAY", "REVERB",
  "OVERTONE", // FX3 only, index 38
] as const;

const ODDS_TYPES = [
  "MID BOOST", "CLEAN BST", "TREBLE BST", "NATURAL OD", "WARM OD", "BLUES OD",
  "OVERDRIVE", "CRUNCH", "T-SCREAM", "TURBO OD", "CENTA OD", "X-OD",
  "DIST", "A-DIST", "FAT DS", "LEAD DS", "RAT", "GUV DS", "DIST+", "X-DIST",
  "METAL DS", "METAL ZONE", "HVY METAL", "METAL CORE", "OCT FUZZ", "60S FUZZ",
  "MUFF FUZZ", "BASS OD", "X-BASS OD", "BASS DS", "BASS DI", "SA DI DRIVE",
  "HI BAND DRV", "BASS MT", "BASS FUZZ",
] as const;

const AMP_TYPES = [
  "TRNSPRNT", "NATURAL", "BOUTIQUE", "SUPREME", "MAXIMUM", "JUGGERNAUT",
  "X-CRUNCH", "X-HI GAIN", "X-MODDED", "X-ULTRA", "X-OPTIMA", "X-TITAN",
  "JC-120", "TWIN", "DELUXE", "TWEED", "DIAMOND", "BRIT STACK", "RECTI STACK",
  "MATCH", "BG COMBO", "ORNG STACK", "BGNR UB",
] as const;

const SP_TYPES = [
  "OFF", "ORIGINAL", '1x8"', '1x10"', '1x12"', '2x12"', '4x10"', '4x12"', '8x12"',
  "USER1", "USER2", "USER3", "USER4", "USER5", "USER6", "USER7", "USER8",
] as const;

const MIC_TYPES = [
  "DYN57", "DYN421", "CND451", "CND87", "FLAT", "RIBON121", "BLEND A", "BLEND B", "BLEND C",
] as const;

const DLY_TYPES = [
  "STANDARD", "MODULATE", "PAN", "REVERSE", "ANALOG", "ANLG MOD",
  "SPACE ECHO", "SHIMMER", "WARP", "TWIST", "GLITCH",
] as const;

const REV_TYPES = [
  "HALL S", "HALL M", "PLATE", "ROOM S", "ROOM L", "AMBIENCE",
  "SPRING", "SHIMMER", "SUB DELAY", "TERA ECHO",
] as const;

// The FX-slot DELAY / REVERB (an effect selectable in an FX1/2/3 slot) expose their OWN,
// smaller type sets, NOT the dedicated DLY/REV block's tables above. Each is a distinct
// enum indexed by the FX-slot's own type byte (0-4); reusing DLY_TYPES/REV_TYPES here would
// mislabel types 2-4 (e.g. FX-slot delay type 2 is WARP, not the dedicated block's PAN).
const FX_DLY_TYPES = ["STANDARD", "MODULATE", "WARP", "TWIST", "GLITCH"] as const;
const FX_REV_TYPES = ["HALL S", "HALL M", "PLATE", "ROOM", "STUDIO"] as const;

// The pedal-controlled effect assigned to the expression pedal input (MEMORY%PFX).
const PFX_TYPES = ["WAH", "PEDAL BEND"] as const;

// MEMORY%COM holds the patch name as space-padded ASCII across its whole width.
const NAME_BYTES = 16;

/** The highest code point the name block can store, since it gives each character one byte. */
const LAST_STORABLE_CHAR = 0xFF;

/** The highest code point the device's own display and name entry cover. */
const LAST_NAMEABLE_CHAR = 0x7F;

/** The characters of a name sitting above a ceiling, empty when every one of them fits. */
const charsAbove = (ceiling: number, name: string): string[] =>
  Array.from(name).filter(char => (char.codePointAt(0) ?? 0) > ceiling);

// MEMORY%CHAIN is a linked list, not a positional array: byte 0 holds the firmware
// value of whichever block comes first, and byte (1 + CHAIN_SLOT_ORDER.indexOf(block))
// holds the firmware value of whatever comes immediately after that block. A firmware
// value of 0 (CHAIN_TERMINATOR) means "connects to OUTPUT". OUTPUT is a fixed endpoint,
// not itself a reorderable block, so it has no entry in CHAIN_SLOT_ORDER. Slot order is
// not signal order: DEFAULT_CHAIN below is the order the signal actually runs in.
const CHAIN_SLOT_ORDER = [
  "pedalFx", "fx1", "drive", "amp", "fx2", "fx3", "noiseGate", "volume", "delay", "reverb",
] as const;

const CHAIN_VALUE_TO_BLOCK: Record<number, string | undefined> = {
  1: "pedalFx", 2: "fx1", 3: "drive", 4: "amp", 5: "fx2",
  6: "fx3", 7: "noiseGate", 8: "volume", 9: "delay", 10: "reverb",
};

/**
 * The order the signal runs in when a patch doesn't rearrange it. Every rejection message lists the
 * blocks in this order rather than in slot order, since this is the one a caller copies and edits.
 */
const DEFAULT_CHAIN: string[] = [
  "pedalFx", "fx1", "drive", "amp", "noiseGate", "volume", "fx2", "fx3", "delay", "reverb",
];

const CHAIN_TERMINATOR = 0;

/**
 * The reverse of a lookup list, typed over that list's own members, which is exactly what the line
 * below puts in it. A name taken from the list resolves without a check; a name from anywhere else
 * (a file, a caller) still goes through `lookupIndex`, which is where the miss is handled.
 */
const indexMap = <T extends string>(list: readonly T[]): Record<T, number> =>
  Object.fromEntries(list.map((name, index) => [name, index])) as Record<T, number>;

const FX_TYPE_IDX  = indexMap(FX_TYPES);
const ODDS_IDX     = indexMap(ODDS_TYPES);
const AMP_TYPE_IDX = indexMap(AMP_TYPES);
const SP_TYPE_IDX  = indexMap(SP_TYPES);
const MIC_TYPE_IDX = indexMap(MIC_TYPES);
const DLY_TYPE_IDX = indexMap(DLY_TYPES);
const REV_TYPE_IDX = indexMap(REV_TYPES);
const PFX_TYPE_IDX = indexMap(PFX_TYPES);
const CHAIN_BLOCK_TO_VALUE: Record<string, number> = Object.fromEntries(
  Object.entries(CHAIN_VALUE_TO_BLOCK)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([value, block]) => [block, Number(value)])
);

const COMP_TYPES   = ["BOSS COMP", "D-COMP", "ORANGE", "X-COMP", "STEREO"] as const;
const LIM_TYPES    = ["BOSS", "RACK 160D", "VTG RACK U"] as const;
const ACRESO_TYPES = ["NATURAL", "WIDE", "BRIGHT"] as const;
const WAH_TYPES    = ["CRY WAH", "VO WAH", "FAT WAH", "LIGHT WAH", "7STR WAH", "RESO WAH"] as const;
const CHORUS_TYPES = ["MONO", "DIR/EFX", "STEREO"] as const;
const ROTARY_SPEED = ["SLOW", "FAST"] as const;
const VIBE_MODES   = ["CHORUS", "VIBRATO"] as const;
const HUM_MODES    = ["PICKING", "AUTO"] as const;
const HUM_VOWELS   = ["a", "e", "i", "o", "u"] as const;
const SBEND_PITCH  = ["-3oct", "-2oct", "-1oct", "+1oct", "+2oct", "+3oct", "+4oct"] as const;
const FB_MODE      = ["NORMAL", "OSC"] as const;
const SLICER_PAT   = Array.from({ length: 20 }, (_, i) => `PATTERN ${i + 1}`);
const NS_DETECT    = ["INPUT", "NS INPUT"] as const;
const FV_CURVE     = ["SLOW1", "SLOW2", "NORMAL", "FAST"] as const;
const NS_DETECT_IDX = indexMap(NS_DETECT);
const FV_CURVE_IDX  = indexMap(FV_CURVE);
const TWIST_MODES  = ["RISE-FALL", "RISE-FADE"] as const;
// PHASER TYPE: raw byte 0/1/2 selects the number of phase-shifting stages.
const PHASER_STAGES = ["4 STAGE", "8 STAGE", "12 STAGE"] as const;
// Playback head combinations.
const SPACE_ECHO_HEAD = ["1", "1+2", "1+3", "2+3", "1+2+3"] as const;

// The 33 reachable HARMONIST harmony values (raw byte 0-32), in raw order.
const HARMONIST_HR = [
  "+1oct&-1oct", "-4th&-6th", "-2oct", "-14th", "-13th", "-12th", "-11th", "-10th", "-9th",
  "-1oct", "-7th", "-6th", "-5th", "-4th", "-3rd", "-2nd", "UNISON", "+2nd", "+3rd", "+4th",
  "+5th", "+6th", "+7th", "+1oct", "+9th", "+10th", "+11th", "+12th", "+13th", "+14th",
  "+2oct", "+3rd&+5th", "+3rd&-4th",
] as const;

// The 1/3-octave series shared by every frequency-stepped lookup field (delay/reverb
// highCut, PARA. EQ lowCut/highCut/midFreq). 29 steps, 20Hz–12.5kHz.
const FREQ_STEPS = [
  "20Hz", "25Hz", "31.5Hz", "40Hz", "50Hz",
  "63Hz", "80Hz", "100Hz", "125Hz", "160Hz",
  "200Hz", "250Hz", "315Hz", "400Hz", "500Hz",
  "630Hz", "800Hz", "1kHz", "1.25kHz", "1.6kHz",
  "2kHz", "2.5kHz", "3.15kHz", "4kHz",
  "5kHz", "6.3kHz", "8kHz", "10kHz", "12.5kHz",
] as const;

// FREQ_STEPS plus a trailing FLAT (index 29), used by delay/PARA. EQ highCut.
const FREQ_HIGH_CUT = [...FREQ_STEPS, "FLAT"] as const;

// FLAT first (index 0), then FREQ_STEPS ascending, used by PARA. EQ lowCut.
const FREQ_LOW_CUT = ["FLAT", ...FREQ_STEPS] as const;

// ENHANCER's LOW FREQ / HIGH FREQ bands. The manual (gx1_parameter_guide.md) only
// documents the outer bounds (31.5 Hz–125 Hz / 800 Hz–8.00 kHz); the intermediate
// steps aren't pinned down by any captured source, so this uses the same 1/3-octave
// series as FREQ_STEPS, restricted to each band's documented range.
const ENHANCER_LOW_FREQ = ["31.5Hz", "40Hz", "50Hz", "63Hz", "80Hz", "100Hz", "125Hz"] as const;
const ENHANCER_HIGH_FREQ = [
  "800Hz", "1kHz", "1.25kHz", "1.6kHz", "2kHz",
  "2.5kHz", "3.15kHz", "4kHz", "5kHz", "6.3kHz", "8kHz",
] as const;

// The patch's song key (MEMORY%OTHER byte 4). HARMONIST_HR's scale-degree entries
// (+2nd, +3rd, +6th, etc.) are diatonic, so the actual semitone shift HARMONIST applies
// depends on this key.
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const KEY_IDX = indexMap(KEY_NAMES);

// The one name a sub-model selection goes by: in a codec field map, on a decoded block, and in a
// patch spec. `type` is the block's own selector and never a sub-model's, so the two words each
// mean exactly one thing.
const SUB_TYPE_FIELD = "subType";

// Effects whose sub-model selector lives in param-block byte p[0], read and written via
// FX_PARAM_MAPS' lookup(SUB_TYPE_FIELD, 0, ...) field. Used by the decoder (to promote the
// selection out of the params bag onto block.subType for display) and by the fx() builder (to
// thread a subType argument back into that bag so it actually encodes).
//
// FX_COM byte[2] is never the subtype for any effect: it is always the bass-mode mirror of the
// type selector in byte[1], which is the guitar-mode one.
const PARAM_SUBTYPE_EFFECTS = new Set([
  "COMPRESSOR", "LIMITER", "AC RESO", "CHORUS", "CLASSIC-VIBE", "HUMANIZER", "OD/DS", "FIXED WAH",
  // DELAY's p[0] selector is its sub-algorithm (STANDARD/MODULATE/WARP/TWIST/GLITCH), each with
  // its own param set, modeled per-subtype in FX_DELAY_TYPE_MAPS and surfaced as subTypes.
  "DELAY",
  // REVERB's p[0] selects its algorithm (FX_REV_TYPES) the same way: one shared param set,
  // surfaced as subTypes like CHORUS.
  "REVERB",
]);

// The PFX equivalent of PARAM_SUBTYPE_EFFECTS. PFX has no separate selector byte, so a type not
// listed here has no sub-model at all and a subType passed to it would encode nowhere.
const PFX_SUBTYPE_EFFECTS = new Set(["WAH"]);

export {
  FX_TYPES, ODDS_TYPES, AMP_TYPES, SP_TYPES, MIC_TYPES, DLY_TYPES, REV_TYPES, PFX_TYPES,
  FX_DLY_TYPES, FX_REV_TYPES, NAME_BYTES, LAST_STORABLE_CHAR, LAST_NAMEABLE_CHAR, charsAbove,
  CHAIN_SLOT_ORDER, CHAIN_VALUE_TO_BLOCK, CHAIN_BLOCK_TO_VALUE, CHAIN_TERMINATOR, DEFAULT_CHAIN,
  FX_TYPE_IDX, ODDS_IDX, AMP_TYPE_IDX, SP_TYPE_IDX, MIC_TYPE_IDX, DLY_TYPE_IDX, REV_TYPE_IDX, PFX_TYPE_IDX,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, WAH_TYPES, CHORUS_TYPES, ROTARY_SPEED,
  VIBE_MODES, HUM_MODES, HUM_VOWELS, SBEND_PITCH, FB_MODE,
  SLICER_PAT, NS_DETECT, NS_DETECT_IDX, FV_CURVE, FV_CURVE_IDX, TWIST_MODES, PHASER_STAGES, SPACE_ECHO_HEAD,
  HARMONIST_HR, PARAM_SUBTYPE_EFFECTS, PFX_SUBTYPE_EFFECTS, SUB_TYPE_FIELD, KEY_NAMES, KEY_IDX,
  FREQ_STEPS, FREQ_HIGH_CUT, FREQ_LOW_CUT, ENHANCER_LOW_FREQ, ENHANCER_HIGH_FREQ,
};
