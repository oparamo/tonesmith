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

const CHAIN_NAMES: Record<number, string> = {
  0: "INPUT", 1: "PFX", 2: "FX1", 3: "OD/DS", 4: "FX3", 5: "DLY",
  6: "FV", 7: "NS", 8: "AMP", 9: "FX2", 10: "REV", 11: "LOOP", 12: "OUTPUT",
};

const indexMap = (list: readonly string[]): Record<string, number> =>
  Object.fromEntries(list.map((v, i) => [v, i]));

const FX_TYPE_IDX  = indexMap(FX_TYPES);
const ODDS_IDX     = indexMap(ODDS_TYPES);
const AMP_TYPE_IDX = indexMap(AMP_TYPES);
const SP_TYPE_IDX  = indexMap(SP_TYPES);
const MIC_TYPE_IDX = indexMap(MIC_TYPES);
const DLY_TYPE_IDX = indexMap(DLY_TYPES);
const REV_TYPE_IDX = indexMap(REV_TYPES);
const CHAIN_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(CHAIN_NAMES).map(([k, v]) => [v, Number(k)])
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

const HARMONIST_KEY = [
  "Am", "Bbm", "Bm", "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m",
  "Gm", "Abm", "A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab",
] as const;

const HARMONIST_HR = (
  [-2, -1, 0, 1, 2].flatMap(n =>
    ["m2", "M2", "m3", "M3", "P4", "P5", "m6", "M6", "m7", "M7"].map(d => `${n}:${d}`)
  )
);

// Only OD/DS stores its subtype in FX_COM byte[2].
// COMPRESSOR, LIMITER, CHORUS, AC RESO, CLASSIC-VIBE, HUMANIZER store their
// type/mode in param-block byte p[0] — handled in codec/fx-params.ts.
const FX_SUBTYPE_LISTS: Record<string, readonly string[]> = {
  "OD/DS": ODDS_TYPES,
};

export {
  FX_TYPES, ODDS_TYPES, AMP_TYPES, SP_TYPES, MIC_TYPES, DLY_TYPES, REV_TYPES,
  CHAIN_NAMES,
  FX_TYPE_IDX, ODDS_IDX, AMP_TYPE_IDX, SP_TYPE_IDX, MIC_TYPE_IDX, DLY_TYPE_IDX, REV_TYPE_IDX,
  CHAIN_IDS,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, WAH_TYPES, CHORUS_TYPES, ROTARY_SPEED,
  VIBE_MODES, HUM_MODES, HUM_VOWELS, RING_INTL, SBEND_PITCH, FB_MODE,
  SLICER_PAT, NS_DETECT, FV_CURVE, TWIST_MODES,
  HARMONIST_KEY, HARMONIST_HR, FX_SUBTYPE_LISTS,
};
