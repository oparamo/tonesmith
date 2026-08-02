/**
 * GX-1 parameter catalog, the single source of truth for the device's *param surface*.
 *
 * Authored from `core/docs/gx1/gx1_parameter_guide.md` and verified against the device's
 * ground-truth address table. Two consumers lean on it:
 *  - `capabilities.ts` derives every item/group `params` list from here (it owns only the
 *    structural + sonic metadata: names, descriptions, models, subtypes);
 *  - the codec drift guard asserts every codec field maps to a catalog param and vice versa,
 *    for every type of every block, so neither the codec nor the described surface can drift
 *    from the documented device.
 *
 * Two shapes, mirroring how the codec models each block:
 *  - `PARAMS_BY_TYPE[block][type]` for blocks whose params vary by the selected type
 *    (`fx`, `pfx`, `delay`, `reverb`). Keys are the type ids used in the codec/constants.
 *  - `PARAMS_BY_BLOCK[block]` for single-shape blocks (`amp`, `odds`, `ns`, `fv`).
 *
 * Selection-only blocks (`cab`, `mic`) have no params and don't appear here.
 *
 * Each param is authored as `def(name, domain, description)`: the domain (see `param-domain.ts`)
 * is the single source, and the human `range` string, machine `values` list, and numeric
 * `min`/`max` bounds all derive from it.
 */
import type { ParamSpec } from "../../types";
import { FREQ_STEPS, FREQ_HIGH_CUT, FREQ_LOW_CUT, ENHANCER_LOW_FREQ, ENHANCER_HIGH_FREQ, SP_TYPES, MIC_TYPES } from "./common";
import { def, num, oneOf, lookupOf, bool, text } from "./param-domain";

// ── Shared param fragments (identical across many types, defined once) ────────

const LEVEL_0_100: ParamSpec = def("LEVEL", num(0, 100), "Output volume.");
const DIRECT: ParamSpec = def("DIRECT", num(0, 100), "Volume of the direct (unaffected) signal.");
const OD_SOLO: ParamSpec[] = [
  def("SOLO", bool(), "Temporary level boost for solo sections."),
  def("SOLO LEVEL", num(0, 100), "Output volume while SOLO is engaged."),
];

// ── FX1/FX2/FX3, per effect type ──────────────────────────────────────────────

const FX_PARAMS: Record<string, ParamSpec[]> = {
  "COMPRESSOR": [
    def("SUSTAIN", num(0, 100), "How long low-level signals are boosted. Higher = more sustain."),
    def("ATTACK", num(0, 100), "Strength of the picking attack. Lower = softer attack."),
    LEVEL_0_100,
  ],
  "LIMITER": [
    def("THRESHOLD", num(0, 100), "Level above which limiting is applied."),
    def("RATIO", text("1:1-INF:1"), "Compression ratio for signals exceeding the threshold."),
    def("ATTACK", num(0, 100), "Strength of the picking attack."),
    def("RELEASE", num(0, 100), "Release time after the signal drops below threshold."),
    LEVEL_0_100,
  ],
  "ENHANCER": [
    def("SENS", num(0, 100), "Sensitivity: how readily the effect activates on softer playing."),
    def("LOW", num(0, 100), "Volume of the low-band enhanced signal."),
    def("LOW FREQ", lookupOf(ENHANCER_LOW_FREQ, "31.5 Hz-125 Hz"), "Center frequency of the low-band enhancer."),
    def("HIGH", num(0, 100), "Volume of the high-band enhanced signal."),
    def("HIGH FREQ", lookupOf(ENHANCER_HIGH_FREQ, "800 Hz-8.00 kHz"), "Center frequency of the high-band enhancer."),
    LEVEL_0_100,
  ],
  "TOUCH WAH": [
    def("FILTER", oneOf("LPF", "BPF", "HPF"), "Filter type: low-pass, band-pass, or high-pass."),
    def("POLARITY", oneOf("DOWN", "UP"), "Direction the filter moves in response to input."),
    def("SENS", num(0, 100), "Sensitivity to picking strength."),
    def("FREQ", num(0, 100), "Center frequency of the wah effect."),
    def("RESO", num(0, 100), "Resonance intensity around the center frequency."),
    def("DECAY", num(0, 100), "Rate at which the filter returns."),
    LEVEL_0_100,
    DIRECT,
  ],
  "AUTO WAH": [
    def("FILTER", oneOf("LPF", "BPF", "HPF"), "Filter type: low-pass, band-pass, or high-pass."),
    def("RATE", num(0, 100, { bpm: true }), "Speed of the auto-wah cycle."),
    def("DEPTH", num(0, 100), "Depth of the auto-wah sweep."),
    def("FREQ", num(0, 100), "Center frequency of the wah."),
    def("RESO", num(0, 100), "Resonance intensity."),
    LEVEL_0_100,
  ],
  "FIXED WAH": [
    def("MANUAL", num(0, 100), "Center frequency of the wah effect."),
    def("LEVEL", num(0, 100), "Volume of the effect sound."),
    def("DIRECT", num(0, 100), "Volume of the direct (dry) signal."),
  ],
  "DEFRETTER": [
    def("SENS", num(0, 100), "Input sensitivity of the defretter."),
    def("DEPTH", num(0, 100), "Rate of the harmonic content."),
    def("TONE", num(-50, 50), "Amount of blurring between notes."),
    def("ATTACK", num(0, 100), "Attack of the picking sound."),
    def("RESO", num(0, 100), "Resonant quality added to the sound."),
    def("LEVEL", num(0, 100), "Volume of the effect sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "SLOW GEAR": [
    def("SENS", num(0, 100), "Picking sensitivity: lower values require harder picking to trigger the swell."),
    def("RISE TIME", num(0, 100), "Time for the volume to reach its maximum from the moment of picking."),
    LEVEL_0_100,
  ],
  "AC. GTR SIM": [
    def("BODY", num(0, 100), "Body resonance amount."),
    def("LOW", num(-50, 50), "Low-frequency volume adjustment."),
    def("HIGH", num(-50, 50), "High-frequency volume adjustment."),
    LEVEL_0_100,
  ],
  "AC RESO": [
    def("RESO", num(0, 100), "Balance between body resonance effect and direct pickup sound."),
    def("TONE", num(-50, 50), "Tonal adjustment."),
    LEVEL_0_100,
  ],
  "SITAR SIM": [
    def("SENS", num(0, 100), "Sensitivity: higher values trigger the sitar effect even with weak picking."),
    def("DEPTH", num(0, 100), "Amount of effect applied."),
    def("TONE", num(-50, 50), "Tonal character: higher boosts the high end."),
    def("RESO", num(0, 100), "Amount of resonance undulation."),
    def("BUZZ", num(0, 100), "Amount of buzz from the characteristic 'buzz bridge'."),
    def("LEVEL", num(0, 100), "Volume of the sitar sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "FEEDBACKER": [
    def("MODE", oneOf("NORMAL", "OSC"), "NORMAL analyzes input pitch; OSC creates internal simulated feedback."),
    def("TRIGGER", bool(), "Applies feedback when ON."),
    def("DEPTH", num(0, 100), "How readily feedback occurs when the effect is on (NORMAL mode)."),
    def("RISE TIME", num(0, 100), "Time for the feedback volume to reach its maximum (OSC mode)."),
    def("OCT RISE TM", num(0, 100), "Time for the octave-up feedback volume to reach its maximum (OSC mode)."),
    def("FEEDBACK", num(0, 100), "Volume of the feedback sound (OSC mode)."),
    def("OCT F-BACK", num(0, 100), "Volume of the octave-up feedback sound (OSC mode)."),
  ],
  "OD/DS": [
    def("DRIVE", num(1, 120), "Depth of distortion."),
    def("TONE", num(-50, 50), "Tonal character."),
    def("LEVEL", num(0, 100), "Volume of the effect sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
    ...OD_SOLO,
  ],
  "PARA. EQ": [
    def("LOW GAIN", num(-20, 20, { unit: "dB" }), "Low-frequency gain."),
    def("MID GAIN", num(-20, 20, { unit: "dB" }), "Mid-frequency gain."),
    def("HIGH GAIN", num(-20, 20, { unit: "dB" }), "High-frequency gain."),
    def("LOW CUT", lookupOf(FREQ_LOW_CUT, "FLAT, 20.0 Hz-12.5 kHz"), "Low-cut filter frequency."),
    def("MID FREQ", lookupOf(FREQ_STEPS, "20 Hz-12.5 kHz"), "Center frequency for the mid band."),
    def("HIGH CUT", lookupOf(FREQ_HIGH_CUT, "20.0 Hz-12.5 kHz, FLAT"), "High-cut filter frequency."),
    def("LEVEL", num(-20, 20, { unit: "dB" }), "Overall output level of the equalizer."),
  ],
  "GEQ": [
    def("125 Hz", num(-20, 20, { unit: "dB" }), "Gain at 125 Hz."),
    def("250 Hz", num(-20, 20, { unit: "dB" }), "Gain at 250 Hz."),
    def("500 Hz", num(-20, 20, { unit: "dB" }), "Gain at 500 Hz."),
    def("1 kHz", num(-20, 20, { unit: "dB" }), "Gain at 1 kHz."),
    def("2 kHz", num(-20, 20, { unit: "dB" }), "Gain at 2 kHz."),
    def("4 kHz", num(-20, 20, { unit: "dB" }), "Gain at 4 kHz."),
    def("LEVEL", num(-20, 20, { unit: "dB" }), "Overall output level."),
  ],
  "LOW GEQ": [
    def("63 Hz", num(-20, 20, { unit: "dB" }), "Gain at 63 Hz."),
    def("125 Hz", num(-20, 20, { unit: "dB" }), "Gain at 125 Hz."),
    def("250 Hz", num(-20, 20, { unit: "dB" }), "Gain at 250 Hz."),
    def("500 Hz", num(-20, 20, { unit: "dB" }), "Gain at 500 Hz."),
    def("1 kHz", num(-20, 20, { unit: "dB" }), "Gain at 1 kHz."),
    def("2 kHz", num(-20, 20, { unit: "dB" }), "Gain at 2 kHz."),
    def("LEVEL", num(-20, 20, { unit: "dB" }), "Overall output level."),
  ],
  "HIGH GEQ": [
    def("250 Hz", num(-20, 20, { unit: "dB" }), "Gain at 250 Hz."),
    def("500 Hz", num(-20, 20, { unit: "dB" }), "Gain at 500 Hz."),
    def("1 kHz", num(-20, 20, { unit: "dB" }), "Gain at 1 kHz."),
    def("2 kHz", num(-20, 20, { unit: "dB" }), "Gain at 2 kHz."),
    def("4 kHz", num(-20, 20, { unit: "dB" }), "Gain at 4 kHz."),
    def("8 kHz", num(-20, 20, { unit: "dB" }), "Gain at 8 kHz."),
    def("LEVEL", num(-20, 20, { unit: "dB" }), "Overall output level."),
  ],
  "CHORUS": [
    def("RATE", num(0, 100, { bpm: true }), "Speed of the chorus modulation."),
    def("DEPTH", num(0, 100), "Depth of the modulation. Set to 0 for a doubling effect."),
    def("PRE-DELAY", num(0, 40, { unit: "ms", decimals: 1 }), "Pre-delay before the effect sound appears. Longer values create a doubling effect."),
    def("LEVEL", num(0, 100), "Volume of the chorus sound."),
    DIRECT,
  ],
  "FLANGER": [
    def("RATE", num(0, 100, { bpm: true }), "Speed of the flanging sweep."),
    def("DEPTH", num(0, 100), "Depth of the flanging effect."),
    def("MANUAL", num(0, 100), "Center frequency of the effect."),
    def("RESO", num(0, 100), "Resonance (feedback): higher values create a more extreme effect."),
    LEVEL_0_100,
    DIRECT,
  ],
  "PHASER": [
    def("TYPE", oneOf("4 STAGE", "8 STAGE", "12 STAGE"), "Number of phase-shifting stages."),
    def("RATE", num(0, 100, { bpm: true }), "Speed of the phase sweep."),
    def("DEPTH", num(0, 100), "Depth of the phaser effect."),
    def("RESO", num(0, 100), "Resonance (feedback)."),
    def("MANUAL", num(0, 100), "Center frequency of the phaser."),
    LEVEL_0_100,
    DIRECT,
  ],
  "SCRIPT PH": [
    def("RATE", num(0, 100, { bpm: true }), "Speed of the phase sweep."),
    def("DEPTH", num(0, 100), "Depth of the phaser effect."),
    LEVEL_0_100,
  ],
  "CLASSIC-VIBE": [
    def("RATE", num(0, 100, { bpm: true }), "Speed of the Classic Vibe modulation."),
    def("DEPTH", num(0, 100), "Depth of the modulation."),
    LEVEL_0_100,
  ],
  "ROTARY": [
    def("SPEED SELECT", oneOf("SLOW", "FAST"), "Current rotor speed."),
    def("SLOW RATE", num(0, 100, { bpm: true }), "Rotation speed when set to SLOW."),
    def("FAST RATE", num(0, 100, { bpm: true }), "Rotation speed when set to FAST."),
    def("DRIVE", num(0, 100), "Amount of preamp distortion."),
    def("BALANCE", num(0, 100), "Balance between treble and bass rotors."),
    LEVEL_0_100,
    DIRECT,
  ],
  "VIBRATO": [
    def("RATE", num(0, 100, { bpm: true }), "Speed of the vibrato."),
    def("DEPTH", num(0, 100), "Depth of the pitch modulation."),
    def("RISE TIME", num(0, 100), "Time from trigger-on until full vibrato is reached."),
    def("TRIGGER", bool(), "Activates the vibrato."),
    LEVEL_0_100,
  ],
  "TREMOLO": [
    def("RATE", num(0, 100, { bpm: true }), "Speed of the volume cycle."),
    def("DEPTH", num(0, 100), "Depth of the volume change."),
    LEVEL_0_100,
  ],
  "SLICER": [
    def("PATTERN", text("P01-P20"), "Selects the rhythm pattern used to slice the sound."),
    def("RATE", num(0, 100, { bpm: true }), "Speed at which the sound is sliced."),
    def("ATTACK", num(0, 100), "Attack volume for the rhythm pattern."),
    def("DUTY", num(1, 99), "Duration of the sound within each slice."),
    LEVEL_0_100,
    DIRECT,
  ],
  "PAN": [
    def("RATE", num(0, 100, { bpm: true }), "Speed of the left/right alternation."),
    def("DEPTH", num(0, 100), "Depth of the panning movement."),
    LEVEL_0_100,
  ],
  "RING MOD": [
    def("INTELLIGENT", bool(), "When ON, oscillator tracks input pitch for a more musical result."),
    def("FREQ", num(0, 100), "Internal oscillator frequency."),
    def("MOD RATE", num(0, 100, { bpm: true }), "Rate of oscillator modulation."),
    def("MOD DEPTH", num(0, 100), "Depth of oscillator modulation."),
    def("LEVEL", num(0, 100), "Volume of the effect sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "HUMANIZER": [
    def("VOWEL1", oneOf("a", "e", "i", "o", "u"), "First vowel sound."),
    def("VOWEL2", oneOf("a", "e", "i", "o", "u"), "Second vowel sound."),
    def("SENS", num(0, 100), "Picking sensitivity (PICKING mode)."),
    def("RATE", num(0, 100, { bpm: true }), "Cycle speed for vowel alternation."),
    def("MANUAL", num(0, 100), "Manual vowel position (AUTO mode)."),
    LEVEL_0_100,
  ],
  "PITCH SHIFT": [
    def("PITCH", num(-24, 24, { unit: "semitones" }), "Amount of pitch shift."),
    def("MODE", oneOf("FAST", "MEDIUM", "SLOW", "MONO"), "Tracking response: FAST has more modulation, SLOW is cleaner."),
    def("PRE-DELAY", num(0, 300, { unit: "ms", bpm: true }), "Delay before the shifted sound appears."),
    def("FEEDBACK", num(0, 100), "Feedback of the shifted signal."),
    def("LEVEL", num(0, 100), "Volume of the pitch-shifted sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "HARMONIST": [
    def("HARMONY", text("-2oct-+2oct"), "Pitch of the harmony voice relative to the input."),
    def("KEY", text("Am-Ab major/minor"), "Key of the song for diatonic harmony calculation."),
    def("PRE-DELAY", num(0, 300, { unit: "ms", bpm: true }), "Delay before the harmony voice appears."),
    def("FEEDBACK", num(0, 100), "Feedback of the harmony signal."),
    def("LEVEL", num(0, 100), "Volume of the harmony sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "OCTAVE": [
    def("-1 OCT", num(0, 100), "Volume of the note one octave below."),
    def("-2 OCT", num(0, 100), "Volume of the note two octaves below."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "HEAVY OCT": [
    def("-1 OCT", num(0, 100), "Volume of the voice one octave below."),
    def("-2 OCT", num(0, 100), "Volume of the voice two octaves below."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "S-BEND": [
    def("TRIGGER", bool(), "Activates the pitch bend."),
    def("PITCH", oneOf("-3oct", "-2oct", "-1oct", "+1oct", "+2oct", "+3oct", "+4oct"), "Amount of pitch shift in octave steps."),
    def("RISE TIME", num(0, 100), "Time for the effect to reach maximum."),
    def("FALL TIME", num(0, 100), "Time for the effect to return to the original pitch."),
  ],
  "PEDAL BEND": [
    def("PITCH MIN", num(-24, 24, { unit: "semitones" }), "Pitch at heel position (pedal fully raised)."),
    def("PITCH MAX", num(-24, 24, { unit: "semitones" }), "Pitch at toe position (pedal fully depressed)."),
    def("PDL POS", num(0, 100), "Current pedal position."),
    def("LEVEL", num(0, 100), "Volume of the pitch bend sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "TUNE DOWN": [
    def("PITCH", num(-12, 0, { unit: "semitones" }), "Amount to tune the guitar down."),
  ],
  // FX-slot DELAY has no params shared across all sub-algorithms: its param set depends on
  // the selected type, so the real params live per-subtype in FX_DELAY_PARAMS (block "fxDelay").
  // This empty entry keeps DELAY present as an fx type for id-coverage, with no flat params.
  "DELAY": [],
  "REVERB": [
    def("TIME", num(0.1, 10, { unit: "s", decimals: 1 }), "Reverb decay time."),
    def("PRE-DELAY", num(0, 200, { unit: "ms" }), "Time until reverb starts."),
    def("LEVEL", num(0, 100), "Volume of the reverb sound."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
  "OVERTONE": [
    def("LOWER", num(0, 100), "Volume of the harmonic one octave below."),
    def("UPPER", num(0, 100), "Volume of the harmonic one octave above."),
    def("UNISON", num(0, 100), "Volume of the slightly detuned unison voice."),
    def("DETUNE", num(0, 100), "Amount of detune applied to the unison voice."),
    def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ],
};

// ── PFX (expression pedal effect), per type ───────────────────────────────────

const PFX_PARAMS: Record<string, ParamSpec[]> = {
  "WAH": [
    def("LEVEL", num(0, 100), "Volume of the wah effect."),
    def("DIRECT", num(0, 100), "Volume of the direct (dry) signal."),
    def("POSITION", num(0, 100), "Current pedal position."),
    def("MIN", num(0, 100), "Filter position at heel (pedal fully raised)."),
    def("MAX", num(0, 100), "Filter position at toe (pedal fully depressed)."),
  ],
  "PEDAL BEND": [
    def("PITCH MIN", num(-24, 24, { unit: "semitones" }), "Pitch at heel position (pedal fully raised)."),
    def("PITCH MAX", num(-24, 24, { unit: "semitones" }), "Pitch at toe position (pedal fully depressed)."),
    def("POSITION", num(0, 100), "Current pedal position."),
    def("LEVEL", num(0, 100), "Volume of the effect sound."),
    def("DIRECT", num(0, 100), "Volume of the direct (dry) signal."),
  ],
};

// ── Delay (dedicated block), per type ─────────────────────────────────────────
//
// Sourced from gx1_parameter_guide.md; every field matches DELAY_TYPE_MAPS in codec/blocks.ts.

const DLY_TIME: ParamSpec = def("TIME", num(1, 2000, { unit: "ms", bpm: true }), "Delay time.");
const DLY_TIME_ANALOG: ParamSpec = def("TIME", num(12, 1200, { unit: "ms", bpm: true }), "Delay time.");
const DLY_FEEDBACK: ParamSpec = def("FEEDBACK", num(0, 100), "Number of delay repeats.");
const DLY_LEVEL: ParamSpec = def("LEVEL", num(1, 120), "Volume of the delay sound.");
const DLY_LEVEL_0: ParamSpec = def("LEVEL", num(0, 120), "Volume of the delay sound.");
const DLY_HIGH_CUT: ParamSpec = def("HIGH CUT", lookupOf(FREQ_HIGH_CUT, "20 Hz-12.5 kHz, FLAT"), "High-cut filter on delay repeats.");
const DLY_MOD: ParamSpec[] = [
  def("MOD RATE", num(0, 100), "Modulation rate of the delay sound."),
  def("MOD DEPTH", num(0, 100), "Modulation depth of the delay sound."),
];

// WARP/TWIST/GLITCH have identical param sets in the dedicated DLY block and the FX-slot
// DELAY, so their param lists are defined once and reused by both (DELAY_PARAMS + FX_DELAY_PARAMS).
const DLY_WARP_PARAMS: ParamSpec[] = [DLY_TIME,
  def("TRIGGER", bool(), "Applies the WARP effect when ON."),
  def("LEVEL", num(0, 100), "Volume of the effect sound.")];
const DLY_TWIST_PARAMS: ParamSpec[] = [
  def("MODE", oneOf("RISE-FALL", "RISE-FADE"), "How rotation stops when TRIGGER goes ON to OFF."),
  def("TRIGGER", bool(), "Applies the TWIST effect when ON."),
  def("RISE TIME", num(0, 100), "Time for the effect to transition to maximum."),
  def("FALL TIME", num(0, 100), "Stop time when MODE changes from RISE to FALL."),
  def("FADE TIME", num(0, 100), "Fade-out time when MODE changes from RISE to FADE."),
  def("LEVEL", num(0, 100), "Volume of the effect sound.")];
const DLY_GLITCH_PARAMS: ParamSpec[] = [
  def("TRIGGER", bool(), "Applies the GLITCH effect when ON."),
  def("TIME", num(0, 100), "Length of the effect sound."),
  def("GLITCH", num(0, 100), "Intensity of the effect."),
  def("BALANCE", num(0, 100), "Balance between the direct and effect sound (100 mutes the direct).")];

const DELAY_PARAMS: Record<string, ParamSpec[]> = {
  "STANDARD": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT],
  "MODULATE": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT, ...DLY_MOD],
  "PAN": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT,
    def("TAP TIME", num(0, 100, { percent: true }), "R-channel delay time relative to the L-channel time (100%).")],
  "REVERSE": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT,
    def("TRIGGER", bool(), "Produces an effect matching what you're playing when ON.")],
  "ANALOG": [DLY_TIME_ANALOG, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT],
  "ANLG MOD": [DLY_TIME_ANALOG, DLY_FEEDBACK, DLY_LEVEL, DLY_HIGH_CUT, ...DLY_MOD],
  "SPACE ECHO": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL_0, DLY_HIGH_CUT,
    def("HEAD", oneOf("1", "1+2", "1+3", "2+3", "1+2+3"), "Combination of playback heads (2/3 give 2x/3x the head-1 delay time).")],
  "SHIMMER": [DLY_TIME, DLY_FEEDBACK, DLY_LEVEL_0, DLY_HIGH_CUT,
    def("PITCH", num(-24, 24), "Amount of pitch shift mixed into the delay."),
    def("BALANCE", num(0, 100), "Balance between the pitch-shifted sound and the direct sound.")],
  "WARP": DLY_WARP_PARAMS,
  "TWIST": DLY_TWIST_PARAMS,
  "GLITCH": DLY_GLITCH_PARAMS,
};

// ── FX-slot DELAY (an FX1/2/3 effect), per sub-algorithm ──────────────────────
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

// ── Reverb (dedicated block), per type ────────────────────────────────────────
//
// Sourced from gx1_parameter_guide.md; matches REV_TYPE_MAPS in codec/blocks.ts. The 7
// standard spaces share one field set; SHIMMER/SUB DELAY/TERA ECHO each differ. TERA ECHO's
// device label "S-TIME" is the codec's `spreadTime` field (aliased in the drift guard).

const REV_STANDARD_PARAMS: ParamSpec[] = [
  def("TIME", num(0.1, 10, { unit: "s", decimals: 1 }), "Reverb decay time."),
  def("TONE", num(-50, 50), "Tonal character of the reverb."),
  def("LEVEL", num(1, 100), "Volume of the reverb sound."),
  def("DENSITY", num(1, 10), "Density of the reverb sound."),
  def("PRE-DELAY", num(0, 200, { unit: "ms" }), "Time until the reverb sound starts."),
  def("DIRECT", num(0, 100), "Volume of the direct sound."),
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
    def("TIME", num(0.1, 10, { unit: "s", decimals: 1 }), "Reverb decay time."),
    def("TONE", num(-50, 50), "Tonal character of the reverb."),
    def("LEVEL", num(0, 100), "Volume of the reverb sound."),
    def("PRE-DELAY", num(0, 200, { unit: "ms" }), "Time until the reverb sound starts."),
    def("PITCH", num(-24, 24), "Amount of pitch shift."),
    def("PITCH LVL", num(0, 100), "Volume of the pitch shifter."),
  ],
  "SUB DELAY": [
    def("TIME", num(1, 2000, { unit: "ms", bpm: true }), "Delay time."),
    def("FEEDBACK", num(0, 100), "Number of delay repeats."),
    def("LEVEL", num(1, 120), "Volume of the delay sound."),
    DLY_HIGH_CUT,
  ],
  "TERA ECHO": [
    def("S-TIME", num(0, 100), "Length of the effect sound."),
    def("TONE", num(-50, 50), "Tonal character."),
    def("LEVEL", num(0, 100), "Volume of the effect sound."),
    def("FEEDBACK", num(0, 100), "Decay of the effect sound."),
    def("DIRECT", num(0, 100), "Volume of the direct sound."),
    def("TRIGGER", bool(), "Holds the effect sound when ON (written to memory as OFF)."),
  ],
};

// ── Single-shape blocks (params are the same regardless of the selected model) ─

const AMP_PARAMS: ParamSpec[] = [
  def("GAIN", num(0, 120), "Amp distortion/gain."),
  def("BASS", num(0, 100), "Low-frequency tone (50 = flat)."),
  def("MIDDLE", num(0, 100), "Midrange balance (50 = flat)."),
  def("TREBLE", num(0, 100), "High-frequency tone (50 = flat)."),
  def("LEVEL", num(0, 100), "Overall preamp output volume."),
  def("SPEAKER", lookupOf(SP_TYPES, "OFF, ORIGINAL, cabinet sizes, USER1-USER8"), "Speaker cabinet the amp is played through. The cab group describes each one."),
  def("MIC", lookupOf(MIC_TYPES, "DYN57-BLEND C"), "Microphone the cabinet is recorded with. The mic group describes each one."),
  ...OD_SOLO,
];

const ODDS_PARAMS: ParamSpec[] = [
  def("DRIVE", num(1, 120), "Depth of distortion."),
  def("TONE", num(-50, 50), "Tonal character."),
  def("LEVEL", num(0, 100), "Volume of the effect sound."),
  def("DIRECT", num(0, 100), "Volume of the direct signal."),
  ...OD_SOLO,
];

const NS_PARAMS: ParamSpec[] = [
  def("THRESHOLD", num(0, 100), "Level above which noise suppression activates."),
  def("RELEASE", num(0, 100), "Time for noise to reach silence after suppression begins."),
  def("DETECT", oneOf("INPUT", "NS INPUT"), "Which signal point drives the detector: INPUT for normal use, NS INPUT when you want delay/reverb tails to survive the NS."),
];

const FV_PARAMS: ParamSpec[] = [
  def("POSITION", num(0, 100), "Current volume position."),
  def("MIN", num(0, 100), "Volume at heel position (pedal fully raised)."),
  def("MAX", num(0, 100), "Volume at toe position (pedal fully depressed)."),
  def("CURVE", oneOf("SLOW1", "SLOW2", "NORMAL", "FAST"), "Volume response curve: how volume changes relative to pedal movement."),
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

/**
 * Codec field name → its human display label, per block and type, for the few fields whose label
 * diverges from the field name. The labels are the hardware's own knob text, which is where the
 * divergence comes from. Single source of truth for these aliases, consumed by two places that
 * must agree: `capabilities.ts` uses it to stamp each param's `key`, and the codec↔catalog drift
 * guard uses it to line codec fields up with their catalog params.
 */
const FIELD_LABEL_ALIASES: Record<PerTypeBlockId, Record<string, Record<string, string>>> = {
  fx: {
    "FEEDBACKER": { octFeedback: "OCT F-BACK" },
    // The stage count (4/8/12) is the codec's numeric "stage" field, but the device labels it TYPE.
    "PHASER": { stage: "TYPE" },
    "ROTARY": { speed: "SPEED SELECT" },
    "OCTAVE": { minus1Oct: "-1 OCT", minus2Oct: "-2 OCT" },
    "HEAVY OCT": { minus1Oct: "-1 OCT", minus2Oct: "-2 OCT" },
  },
  pfx: {},
  delay: {},
  reverb: {
    "TERA ECHO": { spreadTime: "S-TIME" },
    "SHIMMER": { pitchLevel: "PITCH LVL" },
  },
  fxDelay: {},
};

export { PARAMS_BY_TYPE, PARAMS_BY_BLOCK, FIELD_LABEL_ALIASES };
export type { PerTypeBlockId, SingleShapeBlockId };
