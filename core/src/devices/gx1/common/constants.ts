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

// MEMORY%CHAIN is a linked list, not a positional array: byte 0 holds the firmware
// value of whichever block comes first, and byte (1 + CHAIN_BLOCK_ORDER.indexOf(name))
// holds the firmware value of whatever comes immediately after that block. A firmware
// value of 0 (CHAIN_TERMINATOR) means "connects to OUTPUT" — OUTPUT is a fixed endpoint,
// not itself a reorderable block, so it has no entry in CHAIN_BLOCK_ORDER.
const CHAIN_BLOCK_ORDER = ["PFX", "FX1", "OD/DS", "AMP", "FX2", "FX3", "NS", "FV", "DLY", "REV"] as const;

const CHAIN_VALUE_TO_NAME: Record<number, string> = {
  1: "PFX", 2: "FX1", 3: "OD/DS", 4: "AMP", 5: "FX2", 6: "FX3", 7: "NS", 8: "FV", 9: "DLY", 10: "REV",
};

const CHAIN_TERMINATOR = 0;

const indexMap = (list: readonly string[]): Record<string, number> =>
  Object.fromEntries(list.map((value, index) => [value, index]));

const FX_TYPE_IDX  = indexMap(FX_TYPES);
const ODDS_IDX     = indexMap(ODDS_TYPES);
const AMP_TYPE_IDX = indexMap(AMP_TYPES);
const SP_TYPE_IDX  = indexMap(SP_TYPES);
const MIC_TYPE_IDX = indexMap(MIC_TYPES);
const DLY_TYPE_IDX = indexMap(DLY_TYPES);
const REV_TYPE_IDX = indexMap(REV_TYPES);
const CHAIN_NAME_TO_VALUE: Record<string, number> = Object.fromEntries(
  Object.entries(CHAIN_VALUE_TO_NAME).map(([value, name]) => [name, Number(value)])
);

const COMP_TYPES   = ["BOSS COMP", "D-COMP", "ORANGE", "X-COMP", "STEREO"] as const;
const LIM_TYPES    = ["BOSS", "RACK 160D", "VTG RACK U"] as const;
const ACRESO_TYPES = ["NATURAL", "WIDE", "BRIGHT"] as const;
const WAH_TYPES    = ["CRY WAH", "VO WAH", "FAT WAH", "LIGHT WAH", "7STR WAH", "RESO WAH"] as const;
const CHORUS_TYPES = ["MONO", "DIR/EFX", "STEREO"] as const;
const ROTARY_SPEED = ["SLOW", "FAST"] as const;
const VIBE_MODES   = ["CHORUS", "VIBRATO"] as const;
const HUM_MODES    = ["PICKING", "AUTO"] as const;
const HUM_VOWELS   = ["a", "e", "i", "o", "u", "A", "E", "I", "O", "U"] as const;
const RING_INTL    = ["OFF", "ON"] as const;
const SBEND_PITCH  = ["-3oct", "-2oct", "-1oct", "+1oct", "+2oct", "+3oct", "+4oct"] as const;
const FB_MODE      = ["PITCH", "BRUSH", "SCREEM"] as const;
const SLICER_PAT   = Array.from({ length: 20 }, (_, i) => `PATTERN ${i + 1}`);
const NS_DETECT    = ["INPUT", "NS INPUT"] as const;
const FV_CURVE     = ["SLOW1", "SLOW2", "NORMAL", "FAST"] as const;
const TWIST_MODES  = ["TAPE", "TAPE-ECH", "REVERSE"] as const;
const ON_OFF       = ["OFF", "ON"] as const;
// Playback head combinations.
const SPACE_ECHO_HEAD = ["1", "1+2", "1+3", "2+3", "1+2+3"] as const;

const HARMONIST_KEY = [
  "Am", "Bbm", "Bm", "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m",
  "Gm", "Abm", "A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab",
] as const;

const HARMONIST_HR = (
  [-2, -1, 0, 1, 2].flatMap(octave =>
    ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "m7", "M7"].map(interval => `${octave}:${interval}`)
  )
);

// Only OD/DS stores its subtype in FX_COM byte[2].
// COMPRESSOR, LIMITER, CHORUS, AC RESO, CLASSIC-VIBE, HUMANIZER store their
// type/mode in param-block byte p[0] — handled in codec/fx-params.ts.
const FX_SUBTYPE_LISTS: Record<string, readonly string[]> = {
  "OD/DS": ODDS_TYPES,
};

// Effects whose sub-model selector lives in param-block byte p[0] (read/written via
// FX_PARAM_MAPS' lookup("type", 0, ...) field) rather than in FX_COM byte[2]. Used by
// both the decoder (to promote params.type back to block.subType for display) and the
// fx() builder (to thread a subType argument into params.type so it actually encodes).
const PARAM_SUBTYPE_EFFECTS = new Set([
  "COMPRESSOR", "LIMITER", "AC RESO", "CHORUS", "CLASSIC-VIBE", "HUMANIZER",
]);

export {
  FX_TYPES, ODDS_TYPES, AMP_TYPES, SP_TYPES, MIC_TYPES, DLY_TYPES, REV_TYPES,
  CHAIN_BLOCK_ORDER, CHAIN_VALUE_TO_NAME, CHAIN_NAME_TO_VALUE, CHAIN_TERMINATOR,
  FX_TYPE_IDX, ODDS_IDX, AMP_TYPE_IDX, SP_TYPE_IDX, MIC_TYPE_IDX, DLY_TYPE_IDX, REV_TYPE_IDX,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, WAH_TYPES, CHORUS_TYPES, ROTARY_SPEED,
  VIBE_MODES, HUM_MODES, HUM_VOWELS, RING_INTL, SBEND_PITCH, FB_MODE,
  SLICER_PAT, NS_DETECT, FV_CURVE, TWIST_MODES, ON_OFF, SPACE_ECHO_HEAD,
  HARMONIST_KEY, HARMONIST_HR, FX_SUBTYPE_LISTS, PARAM_SUBTYPE_EFFECTS,
};
