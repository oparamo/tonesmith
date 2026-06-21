FX_TYPES = [
    "COMPRESSOR", "LIMITER", "ENHANCER", "TOUCH WAH", "AUTO WAH", "FIXED WAH",
    "DEFRETTER", "SLOW GEAR", "AC. GTR SIM", "AC RESO", "SITAR SIM", "FEEDBACKER",
    "OD/DS", "PARA. EQ", "GEQ", "LOW GEQ", "HIGH GEQ", "CHORUS", "FLANGER",
    "PHASER", "SCRIPT PH", "CLASSIC-VIBE", "ROTARY", "VIBRATO", "TREMOLO",
    "SLICER", "PAN", "RING MOD", "HUMANIZER", "PITCH SHIFT", "HARMONIST",
    "OCTAVE", "HEAVY OCT", "S-BEND", "PEDAL BEND", "TUNE DOWN", "DELAY", "REVERB",
    "OVERTONE",  # FX3 only, index 38
]

ODDS_TYPES = [
    "MID BOOST", "CLEAN BST", "TREBLE BST", "NATURAL OD", "WARM OD", "BLUES OD",
    "OVERDRIVE", "CRUNCH", "T-SCREAM", "TURBO OD", "CENTA OD", "X-OD",
    "DIST", "A-DIST", "FAT DS", "LEAD DS", "RAT", "GUV DS", "DIST+", "X-DIST",
    "METAL DS", "METAL ZONE", "HVY METAL", "METAL CORE", "OCT FUZZ", "60S FUZZ",
    "MUFF FUZZ", "BASS OD", "X-BASS OD", "BASS DS", "BASS DI", "SA DI DRIVE",
    "HI BAND DRV", "BASS MT", "BASS FUZZ",
]

AMP_TYPES = [
    "TRNSPRNT", "NATURAL", "BOUTIQUE", "SUPREME", "MAXIMUM", "JUGGERNAUT",
    "X-CRUNCH", "X-HI GAIN", "X-MODDED", "X-ULTRA", "X-OPTIMA", "X-TITAN",
    "JC-120", "TWIN", "DELUXE", "TWEED", "DIAMOND", "BRIT STACK", "RECTI STACK",
    "MATCH", "BG COMBO", "ORNG STACK", "BGNR UB",
]

SP_TYPES = [
    "OFF", "ORIGINAL", '1x8"', '1x10"', '1x12"', '2x12"', '4x10"', '4x12"', '8x12"',
    "USER1", "USER2", "USER3", "USER4", "USER5", "USER6", "USER7", "USER8",
]

MIC_TYPES = ["DYN57", "DYN421", "CND451", "CND87", "FLAT", "RIBON121", "BLEND A", "BLEND B", "BLEND C"]

DLY_TYPES = ["STANDARD", "MODULATE", "PAN", "REVERSE", "ANALOG", "ANLG MOD",
             "SPACE ECHO", "SHIMMER", "WARP", "TWIST", "GLITCH"]

REV_TYPES = ["HALL S", "HALL M", "PLATE", "ROOM S", "ROOM L", "AMBIENCE",
             "SPRING", "SHIMMER", "SUB DELAY", "TERA ECHO"]

CHAIN_NAMES = {0:"INPUT", 1:"PFX", 2:"FX1", 3:"OD/DS", 4:"FX3", 5:"DLY",
               6:"FV", 7:"NS", 8:"AMP", 9:"FX2", 10:"REV", 11:"LOOP", 12:"OUTPUT"}

# reverse lookups
_idx = lambda lst: {v: i for i, v in enumerate(lst)}
FX_TYPE_IDX   = _idx(FX_TYPES)
ODDS_IDX      = _idx(ODDS_TYPES)
AMP_TYPE_IDX  = _idx(AMP_TYPES)
SP_TYPE_IDX   = _idx(SP_TYPES)
MIC_TYPE_IDX  = _idx(MIC_TYPES)
DLY_TYPE_IDX  = _idx(DLY_TYPES)
REV_TYPE_IDX  = _idx(REV_TYPES)
CHAIN_IDS     = {v: k for k, v in CHAIN_NAMES.items()}

# sub-type lists used by various effects
_COMP_TYPES    = ["BOSS COMP", "D-COMP", "ORANGE", "X-COMP", "STEREO"]
_LIM_TYPES     = ["BOSS", "RACK 160D", "VTG RACK U"]
_ACRESO_TYPES  = ["NATURAL", "WIDE", "BRIGHT"]
_WAH_TYPES     = ["CRY WAH", "VO WAH", "FAT WAH", "LIGHT WAH", "7STR WAH", "RESO WAH"]
_CHORUS_TYPES  = ["MONO", "DIR/EFX", "STEREO"]
_ROTARY_SPEED  = ["SLOW", "FAST"]
_VIBE_MODES    = ["CHORUS", "VIBRATO"]
_HUM_MODES     = ["PICKING", "AUTO"]
_HUM_VOWELS    = ["a", "e", "i", "o", "u", "A", "E", "I", "O", "U"]
_RING_INTL     = ["OFF", "ON"]
_SBEND_PITCH   = ["-3oct", "-2oct", "-1oct", "+1oct", "+2oct", "+3oct", "+4oct"]
_FB_MODE       = ["PITCH", "BRUSH", "SCREEM"]
_SLICER_PAT    = [f"PATTERN {i+1}" for i in range(20)]
_PFX_TYPES     = ["WAH", "PEDAL BEND"]
_NS_DETECT     = ["INPUT", "NS INPUT"]
_FV_CURVE      = ["SLOW1", "SLOW2", "NORMAL", "FAST"]
_HARMONIST_KEY = ["Am", "Bbm", "Bm", "Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m",
                  "Gm", "Abm", "A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab"]
_HARMONIST_HR  = [f"{n}:{d}" for n in range(-2, 3) for d in ["m2","M2","m3","M3","P4","P5","m6","M6","m7","M7"]]
_TWIST_MODES   = ["TAPE", "TAPE-ECH", "REVERSE"]

# effects whose FX_COM byte 2 carries a subtype index
FX_SUBTYPE_LISTS = {
    "OD/DS":        ODDS_TYPES,
    "COMPRESSOR":   _COMP_TYPES,
    "LIMITER":      _LIM_TYPES,
    "CHORUS":       _CHORUS_TYPES,
    "AC RESO":      _ACRESO_TYPES,
    "CLASSIC-VIBE": _VIBE_MODES,
    "HUMANIZER":    _HUM_MODES,
}
