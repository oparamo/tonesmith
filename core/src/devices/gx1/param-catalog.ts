/**
 * GX-1 parameter catalog — the single source of truth for the device's *param surface*.
 *
 * Authored from `core/docs/gx1/gx1_parameter_guide.md` and verified against the device's
 * ground-truth address table. Two consumers lean on it:
 *  - `capabilities.ts` derives every item/group `params` list from here (it owns only the
 *    structural + sonic metadata: names, descriptions, models, subtypes);
 *  - the codec drift guard asserts every codec field maps to a catalog param and vice versa,
 *    for every type of every block — so neither the codec nor the described surface can drift
 *    from the documented device.
 *
 * Two shapes, mirroring how the codec models each block:
 *  - `PARAMS_BY_TYPE[block][type]` — blocks whose params vary by the selected type
 *    (`fx`, `pfx`, `delay`, `reverb`). Keys are the type ids used in the codec/constants.
 *  - `PARAMS_BY_BLOCK[block]` — single-shape blocks (`amp`, `odds`, `ns`, `fv`).
 *
 * Selection-only blocks (`cab`, `mic`) have no params and don't appear here.
 *
 * `range` is free text following the same convention as `ParamSpec` elsewhere.
 */
import type { ParamSpec } from "../../types";

// ── Shared param fragments (identical across many types — defined once) ────────

const LEVEL_0_100: ParamSpec = { name: "LEVEL", range: "0-100", description: "Output volume." };
const DIRECT: ParamSpec = { name: "DIRECT", range: "0-100", description: "Volume of the direct (unaffected) signal." };
const OD_SOLO: ParamSpec[] = [
  { name: "SOLO", range: "OFF, ON", description: "Temporary level boost for solo sections." },
  { name: "SOLO LEVEL", range: "0-100", description: "Output volume while SOLO is engaged." },
];

// ── FX1/FX2/FX3 — per effect type ─────────────────────────────────────────────

const FX_PARAMS: Record<string, ParamSpec[]> = {
  "COMPRESSOR": [
    { name: "SUSTAIN", range: "0-100", description: "How long low-level signals are boosted. Higher = more sustain." },
    { name: "ATTACK", range: "0-100", description: "Strength of the picking attack. Lower = softer attack." },
    LEVEL_0_100,
  ],
  "LIMITER": [
    { name: "THRESHOLD", range: "0-100", description: "Level above which limiting is applied." },
    { name: "RATIO", range: "1:1-INF:1", description: "Compression ratio for signals exceeding the threshold." },
    { name: "ATTACK", range: "0-100", description: "Strength of the picking attack." },
    { name: "RELEASE", range: "0-100", description: "Release time after the signal drops below threshold." },
    LEVEL_0_100,
  ],
  "ENHANCER": [
    { name: "SENS", range: "0-100", description: "Sensitivity — how readily the effect activates on softer playing." },
    { name: "LOW", range: "0-100", description: "Volume of the low-band enhanced signal." },
    { name: "LOW FREQ", range: "31.5 Hz-125 Hz", description: "Center frequency of the low-band enhancer." },
    { name: "HIGH", range: "0-100", description: "Volume of the high-band enhanced signal." },
    { name: "HIGH FREQ", range: "800 Hz-8.00 kHz", description: "Center frequency of the high-band enhancer." },
    LEVEL_0_100,
  ],
  "TOUCH WAH": [
    { name: "FILTER", range: "LPF, BPF, HPF", description: "Filter type: low-pass, band-pass, or high-pass." },
    { name: "POLARITY", range: "DOWN, UP", description: "Direction the filter moves in response to input." },
    { name: "SENS", range: "0-100", description: "Sensitivity to picking strength." },
    { name: "FREQ", range: "0-100", description: "Center frequency of the wah effect." },
    { name: "RESO", range: "0-100", description: "Resonance intensity around the center frequency." },
    { name: "DECAY", range: "0-100", description: "Rate at which the filter returns." },
    LEVEL_0_100,
    DIRECT,
  ],
  "AUTO WAH": [
    { name: "FILTER", range: "LPF, BPF, HPF", description: "Filter type: low-pass, band-pass, or high-pass." },
    { name: "RATE", range: "0-100, BPM", description: "Speed of the auto-wah cycle." },
    { name: "DEPTH", range: "0-100", description: "Depth of the auto-wah sweep." },
    { name: "FREQ", range: "0-100", description: "Center frequency of the wah." },
    { name: "RESO", range: "0-100", description: "Resonance intensity." },
    LEVEL_0_100,
  ],
  "FIXED WAH": [
    { name: "MANUAL", range: "0-100", description: "Center frequency of the wah effect." },
    { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct (dry) signal." },
  ],
  "DEFRETTER": [
    { name: "SENS", range: "0-100", description: "Input sensitivity of the defretter." },
    { name: "DEPTH", range: "0-100", description: "Rate of the harmonic content." },
    { name: "TONE", range: "-50-+50", description: "Amount of blurring between notes." },
    { name: "ATTACK", range: "0-100", description: "Attack of the picking sound." },
    { name: "RESO", range: "0-100", description: "Resonant quality added to the sound." },
    { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "SLOW GEAR": [
    { name: "SENS", range: "0-100", description: "Picking sensitivity — lower values require harder picking to trigger the swell." },
    { name: "RISE TIME", range: "0-100", description: "Time for the volume to reach its maximum from the moment of picking." },
    LEVEL_0_100,
  ],
  "AC. GTR SIM": [
    { name: "BODY", range: "0-100", description: "Body resonance amount." },
    { name: "LOW", range: "-50-+50", description: "Low-frequency volume adjustment." },
    { name: "HIGH", range: "-50-+50", description: "High-frequency volume adjustment." },
    LEVEL_0_100,
  ],
  "AC RESO": [
    { name: "RESO", range: "0-100", description: "Balance between body resonance effect and direct pickup sound." },
    { name: "TONE", range: "-50-+50", description: "Tonal adjustment." },
    LEVEL_0_100,
  ],
  "SITAR SIM": [
    { name: "SENS", range: "0-100", description: "Sensitivity — higher values trigger the sitar effect even with weak picking." },
    { name: "DEPTH", range: "0-100", description: "Amount of effect applied." },
    { name: "TONE", range: "-50-+50", description: "Tonal character — higher boosts the high end." },
    { name: "RESO", range: "0-100", description: "Amount of resonance undulation." },
    { name: "BUZZ", range: "0-100", description: "Amount of buzz from the characteristic 'buzz bridge'." },
    { name: "LEVEL", range: "0-100", description: "Volume of the sitar sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "FEEDBACKER": [
    { name: "MODE", range: "NORMAL, OSC", description: "NORMAL analyzes input pitch; OSC creates internal simulated feedback." },
    { name: "TRIGGER", range: "OFF, ON", description: "Applies feedback when ON." },
    { name: "DEPTH", range: "0-100", description: "How readily feedback occurs when the effect is on (NORMAL mode)." },
    { name: "RISE TIME", range: "0-100", description: "Time for the feedback volume to reach its maximum (OSC mode)." },
    { name: "OCT RISE TM", range: "0-100", description: "Time for the octave-up feedback volume to reach its maximum (OSC mode)." },
    { name: "FEEDBACK", range: "0-100", description: "Volume of the feedback sound (OSC mode)." },
    { name: "OCT F-BACK", range: "0-100", description: "Volume of the octave-up feedback sound (OSC mode)." },
  ],
  "OD/DS": [
    { name: "DRIVE", range: "1-120", description: "Depth of distortion." },
    { name: "TONE", range: "-50-+50", description: "Tonal character." },
    { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
    ...OD_SOLO,
  ],
  "PARA. EQ": [
    { name: "LOW GAIN", range: "-20-+20 dB", description: "Low-frequency gain." },
    { name: "MID GAIN", range: "-20-+20 dB", description: "Mid-frequency gain." },
    { name: "HIGH GAIN", range: "-20-+20 dB", description: "High-frequency gain." },
    { name: "LOW CUT", range: "FLAT, 20.0 Hz-12.5 kHz", description: "Low-cut filter frequency." },
    { name: "MID FREQ", range: "20 Hz-12.5 kHz", description: "Center frequency for the mid band." },
    { name: "HIGH CUT", range: "20.0 Hz-12.5 kHz, FLAT", description: "High-cut filter frequency." },
    { name: "LEVEL", range: "-20-+20 dB", description: "Overall output level of the equalizer." },
  ],
  "GEQ": [
    { name: "125 Hz", range: "-20-+20 dB", description: "Gain at 125 Hz." },
    { name: "250 Hz", range: "-20-+20 dB", description: "Gain at 250 Hz." },
    { name: "500 Hz", range: "-20-+20 dB", description: "Gain at 500 Hz." },
    { name: "1 kHz", range: "-20-+20 dB", description: "Gain at 1 kHz." },
    { name: "2 kHz", range: "-20-+20 dB", description: "Gain at 2 kHz." },
    { name: "4 kHz", range: "-20-+20 dB", description: "Gain at 4 kHz." },
    { name: "LEVEL", range: "-20-+20 dB", description: "Overall output level." },
  ],
  "LOW GEQ": [
    { name: "63 Hz", range: "-20-+20 dB", description: "Gain at 63 Hz." },
    { name: "125 Hz", range: "-20-+20 dB", description: "Gain at 125 Hz." },
    { name: "250 Hz", range: "-20-+20 dB", description: "Gain at 250 Hz." },
    { name: "500 Hz", range: "-20-+20 dB", description: "Gain at 500 Hz." },
    { name: "1 kHz", range: "-20-+20 dB", description: "Gain at 1 kHz." },
    { name: "2 kHz", range: "-20-+20 dB", description: "Gain at 2 kHz." },
    { name: "LEVEL", range: "-20-+20 dB", description: "Overall output level." },
  ],
  "HIGH GEQ": [
    { name: "250 Hz", range: "-20-+20 dB", description: "Gain at 250 Hz." },
    { name: "500 Hz", range: "-20-+20 dB", description: "Gain at 500 Hz." },
    { name: "1 kHz", range: "-20-+20 dB", description: "Gain at 1 kHz." },
    { name: "2 kHz", range: "-20-+20 dB", description: "Gain at 2 kHz." },
    { name: "4 kHz", range: "-20-+20 dB", description: "Gain at 4 kHz." },
    { name: "8 kHz", range: "-20-+20 dB", description: "Gain at 8 kHz." },
    { name: "LEVEL", range: "-20-+20 dB", description: "Overall output level." },
  ],
  "CHORUS": [
    { name: "RATE", range: "0-100, BPM", description: "Speed of the chorus modulation." },
    { name: "DEPTH", range: "0-100", description: "Depth of the modulation. Set to 0 for a doubling effect." },
    { name: "PRE-DELAY", range: "0.0-40.0 ms", description: "Pre-delay before the effect sound appears. Longer values create a doubling effect." },
    { name: "LEVEL", range: "0-100", description: "Volume of the chorus sound." },
    DIRECT,
  ],
  "FLANGER": [
    { name: "RATE", range: "0-100, BPM", description: "Speed of the flanging sweep." },
    { name: "DEPTH", range: "0-100", description: "Depth of the flanging effect." },
    { name: "MANUAL", range: "0-100", description: "Center frequency of the effect." },
    { name: "RESO", range: "0-100", description: "Resonance (feedback) — higher values create a more extreme effect." },
    LEVEL_0_100,
    DIRECT,
  ],
  "PHASER": [
    { name: "TYPE", range: "4 STAGE, 8 STAGE, 12 STAGE", description: "Number of phase-shifting stages." },
    { name: "RATE", range: "0-100, BPM", description: "Speed of the phase sweep." },
    { name: "DEPTH", range: "0-100", description: "Depth of the phaser effect." },
    { name: "RESO", range: "0-100", description: "Resonance (feedback)." },
    { name: "MANUAL", range: "0-100", description: "Center frequency of the phaser." },
    LEVEL_0_100,
    DIRECT,
  ],
  "SCRIPT PH": [
    { name: "RATE", range: "0-100, BPM", description: "Speed of the phase sweep." },
    { name: "DEPTH", range: "0-100", description: "Depth of the phaser effect." },
    LEVEL_0_100,
  ],
  "CLASSIC-VIBE": [
    { name: "RATE", range: "0-100, BPM", description: "Speed of the Classic Vibe modulation." },
    { name: "DEPTH", range: "0-100", description: "Depth of the modulation." },
    LEVEL_0_100,
  ],
  "ROTARY": [
    { name: "SPEED SELECT", range: "SLOW, FAST", description: "Current rotor speed." },
    { name: "SLOW RATE", range: "0-100, BPM", description: "Rotation speed when set to SLOW." },
    { name: "FAST RATE", range: "0-100, BPM", description: "Rotation speed when set to FAST." },
    { name: "DRIVE", range: "0-100", description: "Amount of preamp distortion." },
    { name: "BALANCE", range: "0-100", description: "Balance between treble and bass rotors." },
    LEVEL_0_100,
    DIRECT,
  ],
  "VIBRATO": [
    { name: "RATE", range: "0-100, BPM", description: "Speed of the vibrato." },
    { name: "DEPTH", range: "0-100", description: "Depth of the pitch modulation." },
    { name: "RISE TIME", range: "0-100", description: "Time from trigger-on until full vibrato is reached." },
    { name: "TRIGGER", range: "OFF, ON", description: "Activates the vibrato." },
    LEVEL_0_100,
  ],
  "TREMOLO": [
    { name: "RATE", range: "0-100, BPM", description: "Speed of the volume cycle." },
    { name: "DEPTH", range: "0-100", description: "Depth of the volume change." },
    LEVEL_0_100,
  ],
  "SLICER": [
    { name: "PATTERN", range: "P01-P20", description: "Selects the rhythm pattern used to slice the sound." },
    { name: "RATE", range: "0-100, BPM", description: "Speed at which the sound is sliced." },
    { name: "ATTACK", range: "0-100", description: "Attack volume for the rhythm pattern." },
    { name: "DUTY", range: "1-99", description: "Duration of the sound within each slice." },
    LEVEL_0_100,
    DIRECT,
  ],
  "PAN": [
    { name: "RATE", range: "0-100, BPM", description: "Speed of the left/right alternation." },
    { name: "DEPTH", range: "0-100", description: "Depth of the panning movement." },
    LEVEL_0_100,
  ],
  "RING MOD": [
    { name: "INTELLIGENT", range: "OFF, ON", description: "When ON, oscillator tracks input pitch for a more musical result." },
    { name: "FREQ", range: "0-100", description: "Internal oscillator frequency." },
    { name: "MOD RATE", range: "0-100, BPM", description: "Rate of oscillator modulation." },
    { name: "MOD DEPTH", range: "0-100", description: "Depth of oscillator modulation." },
    { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "HUMANIZER": [
    { name: "VOWEL1", range: "a, e, i, o, u", description: "First vowel sound." },
    { name: "VOWEL2", range: "a, e, i, o, u", description: "Second vowel sound." },
    { name: "SENS", range: "0-100", description: "Picking sensitivity (PICKING mode)." },
    { name: "RATE", range: "0-100, BPM", description: "Cycle speed for vowel alternation." },
    { name: "MANUAL", range: "0-100", description: "Manual vowel position (AUTO mode)." },
    LEVEL_0_100,
  ],
  "PITCH SHIFT": [
    { name: "PITCH", range: "-24-+24 semitones", description: "Amount of pitch shift." },
    { name: "MODE", range: "FAST, MEDIUM, SLOW, MONO", description: "Tracking response — FAST has more modulation; SLOW is cleaner." },
    { name: "PRE-DELAY", range: "0-300 ms, BPM", description: "Delay before the shifted sound appears." },
    { name: "FEEDBACK", range: "0-100", description: "Feedback of the shifted signal." },
    { name: "LEVEL", range: "0-100", description: "Volume of the pitch-shifted sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "HARMONIST": [
    { name: "HARMONY", range: "-2oct-+2oct", description: "Pitch of the harmony voice relative to the input." },
    { name: "KEY", range: "Am-Ab major/minor", description: "Key of the song for diatonic harmony calculation." },
    { name: "PRE-DELAY", range: "0-300 ms, BPM", description: "Delay before the harmony voice appears." },
    { name: "FEEDBACK", range: "0-100", description: "Feedback of the harmony signal." },
    { name: "LEVEL", range: "0-100", description: "Volume of the harmony sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "OCTAVE": [
    { name: "-1 OCT", range: "0-100", description: "Volume of the note one octave below." },
    { name: "-2 OCT", range: "0-100", description: "Volume of the note two octaves below." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "HEAVY OCT": [
    { name: "-1 OCT", range: "0-100", description: "Volume of the voice one octave below." },
    { name: "-2 OCT", range: "0-100", description: "Volume of the voice two octaves below." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "S-BEND": [
    { name: "TRIGGER", range: "OFF, ON", description: "Activates the pitch bend." },
    { name: "PITCH", range: "-3oct, -2oct, -1oct, +1oct, +2oct, +3oct, +4oct", description: "Amount of pitch shift in octave steps." },
    { name: "RISE TIME", range: "0-100", description: "Time for the effect to reach maximum." },
    { name: "FALL TIME", range: "0-100", description: "Time for the effect to return to the original pitch." },
  ],
  "PEDAL BEND": [
    { name: "PITCH MIN", range: "-24-+24 semitones", description: "Pitch at heel position (pedal fully raised)." },
    { name: "PITCH MAX", range: "-24-+24 semitones", description: "Pitch at toe position (pedal fully depressed)." },
    { name: "PDL POS", range: "0-100", description: "Current pedal position." },
    { name: "LEVEL", range: "0-100", description: "Volume of the pitch bend sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "TUNE DOWN": [
    { name: "PITCH", range: "-12-0 semitones", description: "Amount to tune the guitar down." },
  ],
  // FX-slot DELAY has no params shared across all sub-algorithms — its param set depends on
  // the selected type, so the real params live per-subtype in FX_DELAY_PARAMS (block "fxDelay").
  // This empty entry keeps DELAY present as an fx type for id-coverage, with no flat params.
  "DELAY": [],
  "REVERB": [
    { name: "TYPE", range: "HALL S, HALL M, PLATE, ROOM, STUDIO", description: "Reverb algorithm type." },
    { name: "TIME", range: "0.1-10.0 s", description: "Reverb decay time." },
    { name: "PRE-DELAY", range: "0-200 ms", description: "Time until reverb starts." },
    { name: "LEVEL", range: "0-100", description: "Volume of the reverb sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
  "OVERTONE": [
    { name: "LOWER", range: "0-100", description: "Volume of the harmonic one octave below." },
    { name: "UPPER", range: "0-100", description: "Volume of the harmonic one octave above." },
    { name: "UNISON", range: "0-100", description: "Volume of the slightly detuned unison voice." },
    { name: "DETUNE", range: "0-100", description: "Amount of detune applied to the unison voice." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ],
};

// ── PFX (expression pedal effect) — per type ──────────────────────────────────

const PFX_PARAMS: Record<string, ParamSpec[]> = {
  "WAH": [
    { name: "LEVEL", range: "0-100", description: "Volume of the wah effect." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct (dry) signal." },
    { name: "POSITION", range: "0-100", description: "Current pedal position." },
    { name: "MIN", range: "0-100", description: "Filter position at heel (pedal fully raised)." },
    { name: "MAX", range: "0-100", description: "Filter position at toe (pedal fully depressed)." },
  ],
  "PEDAL BEND": [
    { name: "PITCH MIN", range: "-24-+24 semitones", description: "Pitch at heel position (pedal fully raised)." },
    { name: "PITCH MAX", range: "-24-+24 semitones", description: "Pitch at toe position (pedal fully depressed)." },
    { name: "POSITION", range: "0-100", description: "Current pedal position." },
    { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct (dry) signal." },
  ],
};

// ── Delay (dedicated block) — per type ────────────────────────────────────────
//
// Sourced from gx1_parameter_guide.md; every field matches DELAY_TYPE_MAPS in codec/blocks.ts.

const DLY_TIME: ParamSpec = { name: "TIME", range: "1-2000 ms, BPM", description: "Delay time." };
const DLY_TIME_ANALOG: ParamSpec = { name: "TIME", range: "12-1200 ms, BPM", description: "Delay time." };
const DLY_FEEDBACK: ParamSpec = { name: "FEEDBACK", range: "0-100", description: "Number of delay repeats." };
const DLY_LEVEL: ParamSpec = { name: "LEVEL", range: "1-120", description: "Volume of the delay sound." };
const DLY_LEVEL_0: ParamSpec = { name: "LEVEL", range: "0-120", description: "Volume of the delay sound." };
const DLY_HIGH_CUT: ParamSpec = { name: "HIGH CUT", range: "20 Hz-12.5 kHz, FLAT", description: "High-cut filter on delay repeats." };
const DLY_MOD: ParamSpec[] = [
  { name: "MOD RATE", range: "0-100", description: "Modulation rate of the delay sound." },
  { name: "MOD DEPTH", range: "0-100", description: "Modulation depth of the delay sound." },
];

// WARP/TWIST/GLITCH have identical param sets in the dedicated DLY block and the FX-slot
// DELAY, so their param lists are defined once and reused by both (DELAY_PARAMS + FX_DELAY_PARAMS).
const DLY_WARP_PARAMS: ParamSpec[] = [DLY_TIME,
  { name: "TRIGGER", range: "OFF, ON", description: "Applies the WARP effect when ON." },
  { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." }];
const DLY_TWIST_PARAMS: ParamSpec[] = [
  { name: "MODE", range: "RISE-FALL, RISE-FADE", description: "How rotation stops when TRIGGER goes ON to OFF." },
  { name: "TRIGGER", range: "OFF, ON", description: "Applies the TWIST effect when ON." },
  { name: "RISE TIME", range: "0-100", description: "Time for the effect to transition to maximum." },
  { name: "FALL TIME", range: "0-100", description: "Stop time when MODE changes from RISE to FALL." },
  { name: "FADE TIME", range: "0-100", description: "Fade-out time when MODE changes from RISE to FADE." },
  { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." }];
const DLY_GLITCH_PARAMS: ParamSpec[] = [
  { name: "TRIGGER", range: "OFF, ON", description: "Applies the GLITCH effect when ON." },
  { name: "TIME", range: "0-100", description: "Length of the effect sound." },
  { name: "GLITCH", range: "0-100", description: "Intensity of the effect." },
  { name: "BALANCE", range: "0-100", description: "Balance between the direct and effect sound (100 mutes the direct)." }];

const DELAY_PARAMS: Record<string, ParamSpec[]> = {
  "STANDARD": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT],
  "MODULATE": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT, ...DLY_MOD],
  "PAN": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT,
    { name: "TAP TIME", range: "0-100%", description: "R-channel delay time relative to the L-channel time (100%)." }],
  "REVERSE": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT,
    { name: "TRIGGER", range: "OFF, ON", description: "Produces an effect matching what you're playing when ON." }],
  "ANALOG": [DLY_TIME_ANALOG, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT],
  "ANLG MOD": [DLY_TIME_ANALOG, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT, ...DLY_MOD],
  "SPACE ECHO": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL_0, DLY_HIGH_CUT,
    { name: "HEAD", range: "1, 1+2, 1+3, 2+3, 1+2+3", description: "Combination of playback heads (2/3 give 2x/3x the head-1 delay time)." }],
  "SHIMMER": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL_0, DLY_HIGH_CUT,
    { name: "PITCH", range: "-24-+24", description: "Amount of pitch shift mixed into the delay." },
    { name: "BALANCE", range: "0-100", description: "Balance between the pitch-shifted sound and the direct sound." }],
  "WARP": DLY_WARP_PARAMS,
  "TWIST": DLY_TWIST_PARAMS,
  "GLITCH": DLY_GLITCH_PARAMS,
};

// ── FX-slot DELAY (an FX1/2/3 effect) — per sub-algorithm ─────────────────────
//
// Distinct from the dedicated DLY block above: only 5 sub-algorithms, and STANDARD/MODULATE/
// WARP/TWIST/GLITCH share their param sets with the dedicated block's same-named types.
// Matches FX_DELAY_TYPE_MAPS in codec/fx-params.ts.

const FX_DELAY_PARAMS: Record<string, ParamSpec[]> = {
  "STANDARD": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT],
  "MODULATE": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT, ...DLY_MOD],
  "WARP": DLY_WARP_PARAMS,
  "TWIST": DLY_TWIST_PARAMS,
  "GLITCH": DLY_GLITCH_PARAMS,
};

// ── Reverb (dedicated block) — per type ───────────────────────────────────────
//
// Sourced from gx1_parameter_guide.md; matches REV_TYPE_MAPS in codec/blocks.ts. The 7
// standard spaces share one field set; SHIMMER/SUB DELAY/TERA ECHO each differ. TERA ECHO's
// device label "S-TIME" is the codec's `spreadTime` field (aliased in the drift guard).

const REV_STANDARD_PARAMS: ParamSpec[] = [
  { name: "TIME", range: "0.1-10.0 s", description: "Reverb decay time." },
  { name: "TONE", range: "-50-+50", description: "Tonal character of the reverb." },
  { name: "LEVEL", range: "1-100", description: "Volume of the reverb sound." },
  { name: "DENSITY", range: "1-10", description: "Density of the reverb sound." },
  { name: "PRE-DELAY", range: "0-200 ms", description: "Time until the reverb sound starts." },
  { name: "DIRECT", range: "0-100", description: "Volume of the direct sound." },
];

const REVERB_PARAMS: Record<string, ParamSpec[]> = {
  "HALL S": REV_STANDARD_PARAMS,
  "HALL M": REV_STANDARD_PARAMS,
  "PLATE": REV_STANDARD_PARAMS,
  "ROOM S": REV_STANDARD_PARAMS,
  "ROOM L": REV_STANDARD_PARAMS,
  "AMBIENCE": REV_STANDARD_PARAMS,
  "SPRING": REV_STANDARD_PARAMS,
  "SHIMMER": [
    { name: "TIME", range: "0.1-10.0 s", description: "Reverb decay time." },
    { name: "TONE", range: "-50-+50", description: "Tonal character of the reverb." },
    { name: "LEVEL", range: "0-100", description: "Volume of the reverb sound." },
    { name: "PRE-DELAY", range: "0-200 ms", description: "Time until the reverb sound starts." },
    { name: "PITCH", range: "-24-+24", description: "Amount of pitch shift." },
    { name: "PITCH LVL", range: "0-100", description: "Volume of the pitch shifter." },
  ],
  "SUB DELAY": [
    { name: "TIME", range: "1-2000 ms, BPM", description: "Delay time." },
    { name: "FEEDBACK", range: "0-100", description: "Number of delay repeats." },
    { name: "LEVEL", range: "1-120", description: "Volume of the delay sound." },
    { name: "HIGH CUT", range: "20 Hz-12.5 kHz, FLAT", description: "High-cut filter on delay repeats." },
  ],
  "TERA ECHO": [
    { name: "S-TIME", range: "0-100", description: "Length of the effect sound." },
    { name: "TONE", range: "-50-+50", description: "Tonal character." },
    { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." },
    { name: "FEEDBACK", range: "0-100", description: "Decay of the effect sound." },
    { name: "DIRECT", range: "0-100", description: "Volume of the direct sound." },
    { name: "TRIGGER", range: "OFF, ON", description: "Holds the effect sound when ON (written to memory as OFF)." },
  ],
};

// ── Single-shape blocks (params are the same regardless of the selected model) ─

const AMP_PARAMS: ParamSpec[] = [
  { name: "GAIN", range: "0-120", description: "Amp distortion/gain." },
  { name: "BASS", range: "0-100", description: "Low-frequency tone (50 = flat)." },
  { name: "MIDDLE", range: "0-100", description: "Midrange balance (50 = flat)." },
  { name: "TREBLE", range: "0-100", description: "High-frequency tone (50 = flat)." },
  { name: "LEVEL", range: "0-100", description: "Overall preamp output volume." },
  ...OD_SOLO,
];

const ODDS_PARAMS: ParamSpec[] = [
  { name: "DRIVE", range: "1-120", description: "Depth of distortion." },
  { name: "TONE", range: "-50-+50", description: "Tonal character." },
  { name: "LEVEL", range: "0-100", description: "Volume of the effect sound." },
  { name: "DIRECT", range: "0-100", description: "Volume of the direct signal." },
  ...OD_SOLO,
];

const NS_PARAMS: ParamSpec[] = [
  { name: "THRESHOLD", range: "0-100", description: "Level above which noise suppression activates." },
  { name: "RELEASE", range: "0-100", description: "Time for noise to reach silence after suppression begins." },
  { name: "DETECT", range: "INPUT, NS INPUT", description: "Which signal point drives the detector — INPUT for normal use; NS INPUT when you want delay/reverb tails to survive the NS." },
];

const FV_PARAMS: ParamSpec[] = [
  { name: "POSITION", range: "0-100", description: "Current volume position." },
  { name: "MIN", range: "0-100", description: "Volume at heel position (pedal fully raised)." },
  { name: "MAX", range: "0-100", description: "Volume at toe position (pedal fully depressed)." },
  { name: "CURVE", range: "SLOW1, SLOW2, NORMAL, FAST", description: "Volume response curve — how volume changes relative to pedal movement." },
];

// ── Assembled catalog ─────────────────────────────────────────────────────────

/** Blocks whose params vary by the selected type: `[block][type] -> params`. */
const PARAMS_BY_TYPE = {
  fx: FX_PARAMS,
  pfx: PFX_PARAMS,
  delay: DELAY_PARAMS,
  reverb: REVERB_PARAMS,
  // The FX-slot DELAY's per-sub-algorithm params (fx type "DELAY" is per-subtype, unlike the
  // other flat fx types). Surfaced as the subTypes of the fx DELAY capability item.
  fxDelay: FX_DELAY_PARAMS,
} as const satisfies Record<string, Record<string, ParamSpec[]>>;

/** Single-shape blocks: `[block] -> params`. */
const PARAMS_BY_BLOCK = {
  amp: AMP_PARAMS,
  odds: ODDS_PARAMS,
  ns: NS_PARAMS,
  fv: FV_PARAMS,
} as const satisfies Record<string, ParamSpec[]>;

type PerTypeBlockId = keyof typeof PARAMS_BY_TYPE;
type SingleShapeBlockId = keyof typeof PARAMS_BY_BLOCK;

export { PARAMS_BY_TYPE, PARAMS_BY_BLOCK };
export type { PerTypeBlockId, SingleShapeBlockId };
