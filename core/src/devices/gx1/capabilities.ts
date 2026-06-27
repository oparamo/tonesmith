/**
 * GX-1 capability/description data.
 *
 * Item `id` values must match the string constants in `constants.ts` (which drive the codec).
 * Descriptions and `models` fields are sourced from `core/docs/gx1/gx1_parameter_guide.md`.
 *
 * This is the single source of truth consumed by the CLI (`capabilities` command) and the
 * MCP server (`describe_device` tool). Edit here to update descriptions; the codec arrays
 * in `constants.ts` remain the authoritative byte-index lists and must stay in sync.
 * The drift-guard test in `capabilities.test.ts` enforces that.
 */
import type { DeviceCapabilities, CapabilityItem } from "../../types";

// ---------------------------------------------------------------------------
// FX1/FX2/FX3 — the 39 selectable effects
// ---------------------------------------------------------------------------

const FX_ITEMS = [
  {
    id: "COMPRESSOR",
    name: "Compressor",
    description: "Produces a long sustain by evening out the volume level of the input signal. Attenuates loud peaks and boosts quiet signals.",
    subTypes: [
      { id: "BOSS COMP", name: "BOSS Comp", description: "Models a BOSS CS-3.", models: "BOSS CS-3" },
      { id: "D-COMP",    name: "D-Comp",    description: "Models a MXR Dyna Comp.", models: "MXR Dyna Comp" },
      { id: "ORANGE",    name: "Orange",    description: "Modeled on the Dan Armstrong ORANGE SQUEEZER.", models: "Dan Armstrong Orange Squeezer" },
      { id: "X-COMP",    name: "X-Comp",    description: "Uses MDP (Multi-Dimensional Processing) for a consistently natural feel across the pitch and dynamic range." },
      { id: "STEREO",    name: "Stereo",    description: "Stereo compressor — applies compression equally to both left and right channels." },
    ],
    params: [
      { name: "SUSTAIN", range: "0–100", description: "How long low-level signals are boosted. Higher = more sustain." },
      { name: "ATTACK",  range: "0–100", description: "Strength of the picking attack. Lower = softer attack." },
      { name: "LEVEL",   range: "0–100", description: "Output volume." },
    ],
  },
  {
    id: "LIMITER",
    name: "Limiter",
    description: "Attenuates loud input levels to prevent distortion, acting as a ceiling on the signal level.",
    subTypes: [
      { id: "BOSS",       name: "BOSS",        description: "Stereo limiter — general-purpose limiting with a clean character." },
      { id: "RACK 160D",  name: "Rack 160D",   description: "Models a dbx 160X.", models: "dbx 160X" },
      { id: "VTG RACK U", name: "Vintage Rack U", description: "Models a UREI 1178.", models: "UREI 1178" },
    ],
    params: [
      { name: "THRESHOLD", range: "0–100", description: "Level above which limiting is applied." },
      { name: "RATIO",     range: "1:1–INF:1", description: "Compression ratio for signals exceeding the threshold." },
      { name: "ATTACK",    range: "0–100", description: "Strength of the picking attack." },
      { name: "RELEASE",   range: "0–100", description: "Release time after the signal drops below threshold." },
      { name: "LEVEL",     range: "0–100", description: "Output volume." },
    ],
  },
  {
    id: "ENHANCER",
    name: "Enhancer",
    description: "Emphasizes the attack portion of the sound in response to input level changes, adding definition and presence to the audio.",
    params: [
      { name: "SENS",      range: "0–100",          description: "Sensitivity — how readily the effect activates on softer playing." },
      { name: "LOW",       range: "0–100",          description: "Volume of the low-band enhanced signal." },
      { name: "LOW FREQ",  range: "31.5 Hz–125 Hz", description: "Center frequency of the low-band enhancer." },
      { name: "HIGH",      range: "0–100",          description: "Volume of the high-band enhanced signal." },
      { name: "HIGH FREQ", range: "800 Hz–8.00 kHz", description: "Center frequency of the high-band enhancer." },
      { name: "LEVEL",     range: "0–100",          description: "Output volume." },
    ],
  },
  {
    id: "TOUCH WAH",
    name: "Touch Wah",
    description: "Wah effect where the filter responds to changes in guitar volume — picking harder opens the filter.",
    params: [
      { name: "FILTER",   range: "LPF, BPF, HPF", description: "Filter type: low-pass, band-pass, or high-pass." },
      { name: "POLARITY", range: "DOWN, UP",       description: "Direction the filter moves in response to input." },
      { name: "SENS",     range: "0–100",          description: "Sensitivity to picking strength." },
      { name: "FREQ",     range: "0–100",          description: "Center frequency of the wah effect." },
      { name: "RESO",     range: "0–100",          description: "Resonance intensity around the center frequency." },
      { name: "DECAY",    range: "0–100",          description: "Rate at which the filter returns." },
      { name: "LEVEL",    range: "0–100",          description: "Output volume." },
    ],
  },
  {
    id: "AUTO WAH",
    name: "Auto Wah",
    description: "Wah effect that sweeps the filter automatically over a periodic cycle, producing a rhythmic envelope-filter sound.",
    params: [
      { name: "FILTER", range: "LPF, BPF, HPF",    description: "Filter type: low-pass, band-pass, or high-pass." },
      { name: "RATE",   range: "0–100, BPM",        description: "Speed of the auto-wah cycle." },
      { name: "DEPTH",  range: "0–100",             description: "Depth of the auto-wah sweep." },
      { name: "FREQ",   range: "0–100",             description: "Center frequency of the wah." },
      { name: "RESO",   range: "0–100",             description: "Resonance intensity." },
      { name: "LEVEL",  range: "0–100",             description: "Output volume." },
    ],
  },
  {
    id: "FIXED WAH",
    name: "Fixed Wah",
    description: "Static wah effect — the pedal is stopped at a fixed midrange position, producing a vowel-filter tone.",
    subTypes: [
      { id: "CRY WAH",  name: "Cry Wah",   description: "Models the CRY BABY wah pedal popular in the '70s.", models: "Dunlop Cry Baby" },
      { id: "VO WAH",   name: "Vox Wah",   description: "Models the VOX V846.", models: "VOX V846" },
      { id: "FAT WAH",  name: "Fat Wah",   description: "Wah with a bold, thick tone." },
      { id: "LIGHT WAH", name: "Light Wah", description: "Refined wah sound with no unusual characteristics — clean and subtle." },
      { id: "7STR WAH", name: "7-String Wah", description: "Extended range wah compatible with seven-string and baritone guitars." },
      { id: "RESO WAH", name: "Reso Wah",  description: "Completely original wah enhancing the characteristic resonances of analog synth filters." },
    ],
    params: [
      { name: "FREQ",   range: "0–100", description: "Center frequency of the wah effect." },
      { name: "LEVEL",  range: "0–100", description: "Volume of the effect sound." },
      { name: "DIRECT", range: "0–100", description: "Volume of the direct (dry) signal." },
    ],
  },
  {
    id: "DEFRETTER",
    name: "Defretter",
    description: "Simulates a fretless guitar by softening the attack and adding the characteristic slide between notes.",
    params: [
      { name: "SENS",   range: "0–100",  description: "Input sensitivity of the defretter." },
      { name: "DEPTH",  range: "0–100",  description: "Rate of the harmonic content." },
      { name: "TONE",   range: "–50–+50", description: "Amount of blurring between notes." },
      { name: "ATTACK", range: "0–100",  description: "Attack of the picking sound." },
      { name: "RESO",   range: "0–100",  description: "Resonant quality added to the sound." },
      { name: "LEVEL",  range: "0–100",  description: "Volume of the effect sound." },
      { name: "DIRECT", range: "0–100",  description: "Volume of the direct signal." },
    ],
  },
  {
    id: "SLOW GEAR",
    name: "Slow Gear",
    description: "Volume-swell effect that produces a violin-like sound by softening the attack of each note.",
    params: [
      { name: "SENS",      range: "0–100", description: "Picking sensitivity — lower values require harder picking to trigger the swell." },
      { name: "RISE TIME", range: "0–100", description: "Time for the volume to reach its maximum from the moment of picking." },
      { name: "LEVEL",     range: "0–100", description: "Output volume." },
    ],
  },
  {
    id: "AC. GTR SIM",
    name: "Acoustic Guitar Simulator",
    description: "Simulates the tonal character of an acoustic guitar from an electric guitar input.",
    params: [
      { name: "BODY",  range: "0–100",  description: "Body resonance amount." },
      { name: "LOW",   range: "–50–+50", description: "Low-frequency volume adjustment." },
      { name: "HIGH",  range: "–50–+50", description: "High-frequency volume adjustment." },
      { name: "LEVEL", range: "0–100",  description: "Output volume." },
    ],
  },
  {
    id: "AC RESO",
    name: "Acoustic Resonance",
    description: "Changes the pickup sound of an acoustic-electric guitar, creating a richer mic-like sound.",
    subTypes: [
      { id: "NATURAL", name: "Natural", description: "Natural, uncolored acoustic resonance." },
      { id: "WIDE",    name: "Wide",    description: "Full sound with emphasized body resonance." },
      { id: "BRIGHT",  name: "Bright",  description: "Brilliant sound extending into the high range." },
    ],
    params: [
      { name: "RESO",  range: "0–100",  description: "Balance between body resonance effect and direct pickup sound." },
      { name: "TONE",  range: "–50–+50", description: "Tonal adjustment." },
      { name: "LEVEL", range: "0–100",  description: "Output volume." },
    ],
  },
  {
    id: "SITAR SIM",
    name: "Sitar Simulator",
    description: "Simulates the distinctive sound of the sitar, including its characteristic buzz and drone resonance.",
    params: [
      { name: "SENS",   range: "0–100",  description: "Sensitivity — higher values trigger the sitar effect even with weak picking." },
      { name: "DEPTH",  range: "0–100",  description: "Amount of effect applied." },
      { name: "TONE",   range: "–50–+50", description: "Tonal character — higher boosts the high end." },
      { name: "RESO",   range: "0–100",  description: "Amount of resonance undulation." },
      { name: "BUZZ",   range: "0–100",  description: "Amount of buzz from the characteristic 'buzz bridge'." },
      { name: "LEVEL",  range: "0–100",  description: "Volume of the sitar sound." },
      { name: "DIRECT", range: "0–100",  description: "Volume of the direct signal." },
    ],
  },
  {
    id: "FEEDBACKER",
    name: "Feedbacker",
    description: "Generates sustained guitar feedback on demand. Can analyze pitch (NORMAL) or create an internally-generated simulated feedback tone (OSC).",
    params: [
      { name: "MODE",      range: "NORMAL, OSC", description: "NORMAL analyzes input pitch; OSC creates internal simulated feedback." },
      { name: "TRIGGER",   range: "OFF, ON",     description: "Applies feedback when ON." },
      { name: "DEPTH",     range: "0–100",       description: "How readily feedback occurs when the effect is on (NORMAL mode)." },
      { name: "RISE TIME", range: "0–100",       description: "Time for the feedback volume to reach its maximum (OSC mode)." },
      { name: "FEEDBACK",  range: "0–100",       description: "Volume of the feedback sound (OSC mode)." },
      { name: "OCT F-BACK", range: "0–100",      description: "Volume of the octave-up feedback sound (OSC mode)." },
    ],
  },
  {
    id: "OD/DS",
    name: "Overdrive/Distortion",
    description: "Overdrive and distortion effect that distorts the sound to create sustain. The type selects from 35 classic pedal models.",
    subTypes: [
      { id: "MID BOOST",  name: "Mid Boost",   description: "Booster with unique midrange characteristics. Good for solos placed before the amp." },
      { id: "CLEAN BST",  name: "Clean Boost",  description: "Booster with a punchy clean tone." },
      { id: "TREBLE BST", name: "Treble Boost", description: "Bright booster with treble emphasis." },
      { id: "NATURAL OD", name: "Natural OD",   description: "Natural-feeling overdrive distortion." },
      { id: "WARM OD",    name: "Warm OD",      description: "Warm, round overdrive." },
      { id: "BLUES OD",   name: "Blues OD",     description: "Crunch sound of the BOSS BD-2 — faithfully reproduces picking nuances.", models: "BOSS BD-2" },
      { id: "OVERDRIVE",  name: "Overdrive",    description: "BOSS OD-1 type drive — sweet, mild distortion.", models: "BOSS OD-1" },
      { id: "CRUNCH",     name: "Crunch",       description: "Lustrous crunch sound with amp distortion character." },
      { id: "T-SCREAM",   name: "T-Scream",     description: "Models an Ibanez TS-808 Tube Screamer.", models: "Ibanez TS-808" },
      { id: "TURBO OD",   name: "Turbo OD",     description: "High-gain overdrive sound of the BOSS OD-2.", models: "BOSS OD-2" },
      { id: "CENTA OD",   name: "Centaur OD",   description: "Models a KLON CENTAUR.", models: "KLON CENTAUR" },
      { id: "X-OD",       name: "X-OD",         description: "MDP overdrive with ideal distortion across all pitch ranges." },
      { id: "DIST",       name: "Distortion",   description: "Basic, traditional distortion sound." },
      { id: "A-DIST",     name: "A-Dist",       description: "MDP distortion — ideal across all guitar ranges from low to high." },
      { id: "FAT DS",     name: "Fat DS",       description: "Distortion with thick, heavy character." },
      { id: "LEAD DS",    name: "Lead DS",       description: "Combines overdrive smoothness with deep distortion — good for leads." },
      { id: "RAT",        name: "RAT",          description: "Models a Proco RAT.", models: "Proco RAT" },
      { id: "GUV DS",     name: "Guv'nor DS",   description: "Models a Marshall GUV'NOR.", models: "Marshall GUV'NOR" },
      { id: "DIST+",      name: "Dist+",        description: "Models a MXR DISTORTION+.", models: "MXR DISTORTION+" },
      { id: "X-DIST",     name: "X-Dist",       description: "MDP distortion optimized for each pitch range." },
      { id: "METAL DS",   name: "Metal DS",     description: "Distortion ideal for heavy riffs." },
      { id: "METAL ZONE", name: "Metal Zone",   description: "BOSS MT-2 type wide-ranging metal sound.", models: "BOSS MT-2" },
      { id: "HVY METAL",  name: "Heavy Metal",  description: "BOSS HM-2 type — a compressed distortion like a cranked-up amp.", models: "BOSS HM-2" },
      { id: "METAL CORE", name: "Metal Core",   description: "BOSS ML-2 type — optimal for high-speed metal riffs.", models: "BOSS ML-2" },
      { id: "OCT FUZZ",   name: "Oct Fuzz",     description: "Fuzz sound with rich harmonic content and an octave character." },
      { id: "60S FUZZ",   name: "60s Fuzz",     description: "Models a FUZZFACE — fat, vintage fuzz sound.", models: "Dallas Arbiter Fuzz Face" },
      { id: "MUFF FUZZ",  name: "Muff Fuzz",    description: "Models an Electro-Harmonix Big Muff π.", models: "Electro-Harmonix Big Muff π" },
      { id: "BASS OD",    name: "Bass OD",      description: "Overdrive tuned for bass guitar." },
      { id: "X-BASS OD",  name: "X-Bass OD",   description: "MDP overdrive providing ideal distortion across all bass pitch ranges." },
      { id: "BASS DS",    name: "Bass DS",      description: "Distortion tuned for bass guitar." },
      { id: "BASS DI",    name: "Bass DI",      description: "Models a MXR Bass D.I.+.", models: "MXR Bass D.I.+" },
      { id: "SA DI DRIVE", name: "SA DI Drive", description: "Models a TECH21 SANSAMP BASS DRIVER DI.", models: "TECH21 SansAmp Bass Driver DI" },
      { id: "HI BAND DRV", name: "Hi Band Drive", description: "Distortion applied only to high frequencies — retains strong low-end while adding distortion." },
      { id: "BASS MT",    name: "Bass MT",      description: "Wild, radical distortion for bass." },
      { id: "BASS FUZZ",  name: "Bass Fuzz",    description: "Fuzz tuned for bass guitar." },
    ],
    params: [
      { name: "DRIVE",  range: "1–120",  description: "Depth of distortion." },
      { name: "TONE",   range: "–50–+50", description: "Tonal character." },
      { name: "LEVEL",  range: "0–100",  description: "Volume of the effect sound." },
      { name: "DIRECT", range: "0–100",  description: "Volume of the direct signal." },
    ],
  },
  {
    id: "PARA. EQ",
    name: "Parametric EQ",
    description: "Three-band parametric equalizer with adjustable center frequency for the mid band.",
    params: [
      { name: "LOW GAIN",  range: "–20–+20 dB",          description: "Low-frequency gain." },
      { name: "MID GAIN",  range: "–20–+20 dB",          description: "Mid-frequency gain." },
      { name: "HIGH GAIN", range: "–20–+20 dB",          description: "High-frequency gain." },
      { name: "LOW CUT",   range: "FLAT, 20.0 Hz–12.5 kHz", description: "Low-cut filter frequency." },
      { name: "MID FREQ",  range: "20 Hz–12.5 kHz",      description: "Center frequency for the mid band." },
      { name: "HIGH CUT",  range: "20.0 Hz–12.5 kHz, FLAT", description: "High-cut filter frequency." },
      { name: "LEVEL",     range: "–20–+20 dB",          description: "Overall output level of the equalizer." },
    ],
  },
  {
    id: "GEQ",
    name: "Graphic EQ",
    description: "Six-band graphic equalizer covering the full frequency range (125 Hz – 4 kHz).",
    params: [
      { name: "125 Hz", range: "–20–+20 dB", description: "Gain at 125 Hz." },
      { name: "250 Hz", range: "–20–+20 dB", description: "Gain at 250 Hz." },
      { name: "500 Hz", range: "–20–+20 dB", description: "Gain at 500 Hz." },
      { name: "1 kHz",  range: "–20–+20 dB", description: "Gain at 1 kHz." },
      { name: "2 kHz",  range: "–20–+20 dB", description: "Gain at 2 kHz." },
      { name: "4 kHz",  range: "–20–+20 dB", description: "Gain at 4 kHz." },
      { name: "LEVEL",  range: "–20–+20 dB", description: "Overall output level." },
    ],
  },
  {
    id: "LOW GEQ",
    name: "Low Graphic EQ",
    description: "Six-band graphic equalizer focused on lower frequencies (63 Hz – 2 kHz).",
    params: [
      { name: "63 Hz",  range: "–20–+20 dB", description: "Gain at 63 Hz." },
      { name: "125 Hz", range: "–20–+20 dB", description: "Gain at 125 Hz." },
      { name: "250 Hz", range: "–20–+20 dB", description: "Gain at 250 Hz." },
      { name: "500 Hz", range: "–20–+20 dB", description: "Gain at 500 Hz." },
      { name: "1 kHz",  range: "–20–+20 dB", description: "Gain at 1 kHz." },
      { name: "2 kHz",  range: "–20–+20 dB", description: "Gain at 2 kHz." },
      { name: "LEVEL",  range: "–20–+20 dB", description: "Overall output level." },
    ],
  },
  {
    id: "HIGH GEQ",
    name: "High Graphic EQ",
    description: "Six-band graphic equalizer focused on higher frequencies (250 Hz – 8 kHz).",
    params: [
      { name: "250 Hz", range: "–20–+20 dB", description: "Gain at 250 Hz." },
      { name: "500 Hz", range: "–20–+20 dB", description: "Gain at 500 Hz." },
      { name: "1 kHz",  range: "–20–+20 dB", description: "Gain at 1 kHz." },
      { name: "2 kHz",  range: "–20–+20 dB", description: "Gain at 2 kHz." },
      { name: "4 kHz",  range: "–20–+20 dB", description: "Gain at 4 kHz." },
      { name: "8 kHz",  range: "–20–+20 dB", description: "Gain at 8 kHz." },
      { name: "LEVEL",  range: "–20–+20 dB", description: "Overall output level." },
    ],
  },
  {
    id: "CHORUS",
    name: "Chorus",
    description: "Adds a slightly pitch-modulated copy of the signal to create spaciousness, depth, and a shimmering quality.",
    subTypes: [
      { id: "MONO",    name: "Mono",    description: "Mono chorus — same sound output from both L and R channels." },
      { id: "DIR/EFX", name: "Dir/Efx", description: "Stereo chorus using spatial synthesis: direct in L, effect in R." },
      { id: "STEREO",  name: "Stereo",  description: "Stereo chorus — different chorus applied to L and R channels." },
    ],
    params: [
      { name: "RATE",      range: "0–100, BPM",    description: "Speed of the chorus modulation." },
      { name: "DEPTH",     range: "0–100",          description: "Depth of the modulation. Set to 0 for a doubling effect." },
      { name: "PRE-DELAY", range: "0.0–40.0 ms",   description: "Pre-delay before the effect sound appears. Longer values create a doubling effect." },
      { name: "LEVEL",     range: "0–100",          description: "Volume of the chorus sound." },
    ],
  },
  {
    id: "FLANGER",
    name: "Flanger",
    description: "Gives a twisting, jet-airplane-like character to the sound by sweeping a comb-filtered copy against the original.",
    params: [
      { name: "RATE",   range: "0–100, BPM", description: "Speed of the flanging sweep." },
      { name: "DEPTH",  range: "0–100",      description: "Depth of the flanging effect." },
      { name: "MANUAL", range: "0–100",      description: "Center frequency of the effect." },
      { name: "RESO",   range: "0–100",      description: "Resonance (feedback) — higher values create a more extreme effect." },
      { name: "LEVEL",  range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "PHASER",
    name: "Phaser",
    description: "Gives a whooshing, swirling character by adding phase-shifted copies to the direct sound. Number of stages selects between 4, 8, or 12-stage phasing.",
    params: [
      { name: "TYPE",   range: "4 STAGE, 8 STAGE, 12 STAGE", description: "Number of phase-shifting stages." },
      { name: "RATE",   range: "0–100, BPM",                description: "Speed of the phase sweep." },
      { name: "DEPTH",  range: "0–100",                     description: "Depth of the phaser effect." },
      { name: "RESO",   range: "0–100",                     description: "Resonance (feedback)." },
      { name: "MANUAL", range: "0–100",                     description: "Center frequency of the phaser." },
      { name: "LEVEL",  range: "0–100",                     description: "Output volume." },
    ],
  },
  {
    id: "SCRIPT PH",
    name: "Script Phaser",
    description: "Models the MXR Phase 90 manufactured during the '70s — a classic 4-stage phaser with a warm, organic character.",
    models: "MXR Phase 90 (script logo era)",
    params: [
      { name: "RATE",  range: "0–100, BPM", description: "Speed of the phase sweep." },
      { name: "DEPTH", range: "0–100",      description: "Depth of the phaser effect." },
      { name: "LEVEL", range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "CLASSIC-VIBE",
    name: "Classic Vibe",
    description: "Resembles a phaser but provides a unique undulation that a regular phaser cannot achieve — the rotary-speaker-like Uni-Vibe character.",
    subTypes: [
      { id: "CHORUS",  name: "Chorus",  description: "Direct sound and effect sound are mixed together." },
      { id: "VIBRATO", name: "Vibrato", description: "Only the effect sound is output — full pitch modulation." },
    ],
    params: [
      { name: "RATE",  range: "0–100, BPM", description: "Speed of the Classic Vibe modulation." },
      { name: "DEPTH", range: "0–100",      description: "Depth of the modulation." },
      { name: "LEVEL", range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "ROTARY",
    name: "Rotary",
    description: "Simulates the sound of a rotating speaker (Leslie cabinet), with separate slow and fast speed settings.",
    params: [
      { name: "SPEED SELECT", range: "SLOW, FAST", description: "Current rotor speed." },
      { name: "SLOW RATE",    range: "0–100, BPM", description: "Rotation speed when set to SLOW." },
      { name: "FAST RATE",    range: "0–100, BPM", description: "Rotation speed when set to FAST." },
      { name: "DRIVE",        range: "0–100",      description: "Amount of preamp distortion." },
      { name: "BALANCE",      range: "0–100",      description: "Balance between treble and bass rotors." },
      { name: "LEVEL",        range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "VIBRATO",
    name: "Vibrato",
    description: "Creates vibrato by cyclically modulating the pitch, similar to a guitarist's finger vibrato but more precise and consistent.",
    params: [
      { name: "RATE",      range: "0–100, BPM", description: "Speed of the vibrato." },
      { name: "DEPTH",     range: "0–100",      description: "Depth of the pitch modulation." },
      { name: "RISE TIME", range: "0–100",      description: "Time from trigger-on until full vibrato is reached." },
      { name: "TRIGGER",   range: "OFF, ON",    description: "Activates the vibrato." },
      { name: "LEVEL",     range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "TREMOLO",
    name: "Tremolo",
    description: "Creates a cyclic change in volume, from subtle pulsing to choppy amplitude modulation.",
    params: [
      { name: "RATE",  range: "0–100, BPM", description: "Speed of the volume cycle." },
      { name: "DEPTH", range: "0–100",      description: "Depth of the volume change." },
      { name: "LEVEL", range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "SLICER",
    name: "Slicer",
    description: "Rhythmically interrupts the sound using pattern-based slicing, creating an effect like a stutter or choppy arpeggio backing phrase.",
    params: [
      { name: "PATTERN", range: "P01–P20",    description: "Selects the rhythm pattern used to slice the sound." },
      { name: "RATE",    range: "0–100, BPM", description: "Speed at which the sound is sliced." },
      { name: "ATTACK",  range: "0–100",      description: "Attack volume for the rhythm pattern." },
      { name: "DUTY",    range: "1–99",       description: "Duration of the sound within each slice." },
      { name: "LEVEL",   range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "PAN",
    name: "Pan",
    description: "Alternately changes the left/right volume in stereo, making the guitar sound appear to fly back and forth between speakers.",
    params: [
      { name: "RATE",  range: "0–100, BPM", description: "Speed of the left/right alternation." },
      { name: "DEPTH", range: "0–100",      description: "Depth of the panning movement." },
      { name: "LEVEL", range: "0–100",      description: "Output volume." },
    ],
  },
  {
    id: "RING MOD",
    name: "Ring Modulator",
    description: "Creates a bell-like sound by ring-modulating the guitar signal with an internal oscillator. The result can be atonal and percussive.",
    params: [
      { name: "INTELLIGENT", range: "OFF, ON",    description: "When ON, oscillator tracks input pitch for a more musical result." },
      { name: "FREQ",        range: "0–100",      description: "Internal oscillator frequency." },
      { name: "MOD RATE",    range: "0–100, BPM", description: "Rate of oscillator modulation." },
      { name: "MOD DEPTH",   range: "0–100",      description: "Depth of oscillator modulation." },
      { name: "LEVEL",       range: "0–100",      description: "Volume of the effect sound." },
      { name: "DIRECT",      range: "0–100",      description: "Volume of the direct signal." },
    ],
  },
  {
    id: "HUMANIZER",
    name: "Humanizer",
    description: "Alters the guitar signal to produce human-like vocalized sounds by cycling between two selectable vowels.",
    subTypes: [
      { id: "PICKING", name: "Picking", description: "Vowels switch in response to picking — picking triggers the vowel change." },
      { id: "AUTO",    name: "Auto",    description: "Vowels switch automatically based on rate and depth." },
    ],
    params: [
      { name: "VOWEL1", range: "a, e, i, o, u", description: "First vowel sound." },
      { name: "VOWEL2", range: "a, e, i, o, u", description: "Second vowel sound." },
      { name: "SENS",   range: "0–100",         description: "Picking sensitivity (PICKING mode)." },
      { name: "RATE",   range: "0–100, BPM",    description: "Cycle speed for vowel alternation." },
      { name: "LEVEL",  range: "0–100",         description: "Output volume." },
    ],
  },
  {
    id: "PITCH SHIFT",
    name: "Pitch Shifter",
    description: "Changes the pitch of the original sound up or down within a range of two octaves.",
    params: [
      { name: "PITCH",     range: "–24–+24 semitones", description: "Amount of pitch shift." },
      { name: "MODE",      range: "FAST, MEDIUM, SLOW, MONO", description: "Tracking response — FAST has more modulation; SLOW is cleaner." },
      { name: "PRE-DELAY", range: "0–300 ms, BPM",    description: "Delay before the shifted sound appears." },
      { name: "FEEDBACK",  range: "0–100",             description: "Feedback of the shifted signal." },
      { name: "LEVEL",     range: "0–100",             description: "Volume of the pitch-shifted sound." },
      { name: "DIRECT",    range: "0–100",             description: "Volume of the direct signal." },
    ],
  },
  {
    id: "HARMONIST",
    name: "Harmonist",
    description: "Adds a pitch-shifted harmony voice based on analysis of the guitar input and a selected musical key, allowing diatonic harmonies.",
    params: [
      { name: "HARMONY",   range: "–2oct–+2oct",  description: "Pitch of the harmony voice relative to the input." },
      { name: "KEY",       range: "Am–Ab major/minor", description: "Key of the song for diatonic harmony calculation." },
      { name: "PRE-DELAY", range: "0–300 ms, BPM", description: "Delay before the harmony voice appears." },
      { name: "FEEDBACK",  range: "0–100",         description: "Feedback of the harmony signal." },
      { name: "LEVEL",     range: "0–100",         description: "Volume of the harmony sound." },
      { name: "DIRECT",    range: "0–100",         description: "Volume of the direct signal." },
    ],
  },
  {
    id: "OCTAVE",
    name: "Octave",
    description: "Adds notes one and two octaves lower than the input, creating a richer, fuller sound. Tracks single notes only.",
    params: [
      { name: "-1 OCT", range: "0–100", description: "Volume of the note one octave below." },
      { name: "-2 OCT", range: "0–100", description: "Volume of the note two octaves below." },
      { name: "DIRECT", range: "0–100", description: "Volume of the direct signal." },
    ],
  },
  {
    id: "HEAVY OCT",
    name: "Heavy Octave",
    description: "Adds notes one and two octaves lower, like the Octave effect, but also works polyphonically — applies to chords as well as single notes.",
    params: [
      { name: "-1 OCT", range: "0–100", description: "Volume of the voice one octave below." },
      { name: "-2 OCT", range: "0–100", description: "Volume of the voice two octaves below." },
      { name: "DIRECT", range: "0–100", description: "Volume of the direct signal." },
    ],
  },
  {
    id: "S-BEND",
    name: "S-Bend",
    description: "Gives a pitch-shift up or down effect in octave steps, triggered on demand — simulates extreme vibrato-bar techniques.",
    params: [
      { name: "TRIGGER",   range: "OFF, ON",                                description: "Activates the pitch bend." },
      { name: "PITCH",     range: "–3oct, –2oct, –1oct, +1oct, +2oct, +3oct, +4oct", description: "Amount of pitch shift in octave steps." },
      { name: "RISE TIME", range: "0–100", description: "Time for the effect to reach maximum." },
      { name: "FALL TIME", range: "0–100", description: "Time for the effect to return to the original pitch." },
    ],
  },
  {
    id: "PEDAL BEND",
    name: "Pedal Bend",
    description: "Expression-pedal-controlled pitch bend effect — heel sets the minimum pitch, toe sets the maximum.",
    params: [
      { name: "PITCH MIN", range: "–24–+24 semitones", description: "Pitch at heel position (pedal fully raised)." },
      { name: "PITCH MAX", range: "–24–+24 semitones", description: "Pitch at toe position (pedal fully depressed)." },
      { name: "PDL POS",   range: "0–100",             description: "Current pedal position." },
      { name: "LEVEL",     range: "0–100",             description: "Volume of the pitch bend sound." },
      { name: "DIRECT",    range: "0–100",             description: "Volume of the direct signal." },
    ],
  },
  {
    id: "TUNE DOWN",
    name: "Tune Down",
    description: "Gives the effect of tuning the guitar lower by up to 12 semitones, without retuning. Best used with single notes.",
    params: [
      { name: "PITCH", range: "–12–0 semitones", description: "Amount to tune the guitar down." },
    ],
  },
  {
    id: "DELAY",
    name: "Delay (FX slot)",
    description: "Delay effect in the FX slot. Adds delayed sound for echo, depth, or special effects. Includes standard, modulated, warp, twist, and glitch types.",
    params: [
      { name: "TYPE",     range: "STANDARD, MODULATE, WARP, TWIST, GLITCH", description: "Delay algorithm type." },
      { name: "TIME",     range: "1–2000 ms, BPM", description: "Delay time." },
      { name: "FEEDBACK", range: "0–100",           description: "Number of delay repeats." },
      { name: "LEVEL",    range: "1–120",           description: "Volume of the delay sound." },
      { name: "HIGH CUT", range: "20 Hz–12.5 kHz, FLAT", description: "High-cut filter on delay repeats." },
    ],
  },
  {
    id: "REVERB",
    name: "Reverb (FX slot)",
    description: "Reverb effect in the FX slot. Adds reverberation — hall, plate, room, ambience, or spring types.",
    params: [
      { name: "TYPE",      range: "HALL S, HALL M, PLATE, ROOM, STUDIO", description: "Reverb algorithm type." },
      { name: "TIME",      range: "0.1–10.0 s",   description: "Reverb decay time." },
      { name: "PRE-DELAY", range: "0–200 ms",     description: "Time until reverb starts." },
      { name: "LEVEL",     range: "0–100",         description: "Volume of the reverb sound." },
      { name: "DIRECT",    range: "0–100",         description: "Volume of the direct signal." },
    ],
  },
  {
    id: "OVERTONE",
    name: "Overtone",
    description: "FX3 only. Uses MDP technology to add new harmonics to the sound, producing richness and resonance not present in the original — adds octave-up, octave-down, and detuned unison voices.",
    params: [
      { name: "LOWER",  range: "0–100", description: "Volume of the harmonic one octave below." },
      { name: "UPPER",  range: "0–100", description: "Volume of the harmonic one octave above." },
      { name: "UNISON", range: "0–100", description: "Volume of the slightly detuned unison voice." },
      { name: "DETUNE", range: "0–100", description: "Amount of detune applied to the unison voice." },
      { name: "DIRECT", range: "0–100", description: "Volume of the direct signal." },
    ],
  },
] as const satisfies CapabilityItem[];

// ---------------------------------------------------------------------------
// OD/DS block — separate overdrive/distortion block (same types as above OD/DS subtype list)
// ---------------------------------------------------------------------------

const ODDS_ITEMS = FX_ITEMS.find(f => f.id === "OD/DS")!.subTypes as unknown as CapabilityItem[];

// ---------------------------------------------------------------------------
// AMP models
// ---------------------------------------------------------------------------

const AMP_ITEMS: CapabilityItem[] = [
  { id: "TRNSPRNT",   name: "Transparent",    description: "Extremely flat response across a broad frequency range. Good for acoustic guitar or any signal where you want zero amp coloration." },
  { id: "NATURAL",    name: "Natural",         description: "Clean, unembellished sound that minimizes amp idiosyncrasies like treble harshness or boomy lows." },
  { id: "BOUTIQUE",   name: "Boutique",        description: "Crunch sound that allows picking nuances to come through even more faithfully than on conventional combo amps." },
  { id: "SUPREME",    name: "Supreme",         description: "Great-feeling crunch sound that responds to picking nuances and takes advantage of the character of a 4x12\" cabinet." },
  { id: "MAXIMUM",    name: "Maximum",         description: "Delivers the response and tone of a vintage Marshall while pushing it to even higher gain.", models: "Marshall (high-gain voiced)" },
  { id: "JUGGERNAUT", name: "Juggernaut",      description: "Large stack sound tweaked extensively for the ultimate metal tone." },
  { id: "X-CRUNCH",   name: "X-Crunch",        description: "Crunch sound using MDP for a crisp, well-defined tone from all strings." },
  { id: "X-HI GAIN",  name: "X-Hi Gain",       description: "High-gain sound using MDP for a wide range and a great-feeling sense of note separation." },
  { id: "X-MODDED",   name: "X-Modded",        description: "Core sound using MDP — preserves definition even with extreme gain settings." },
  { id: "X-ULTRA",    name: "X-Ultra",          description: "High-gain MDP sound with a dense midrange tone and strong dynamics." },
  { id: "X-OPTIMA",   name: "X-Optima",         description: "High-gain MDP sound emphasizing sonic balance — good for ensemble playing." },
  { id: "X-TITAN",    name: "X-Titan",          description: "Tight high-gain sound with an edge, using MDP." },
  { id: "JC-120",     name: "JC-120",           description: "Models the sound of the Roland JC-120 — clean, bright, solid-state character.", models: "Roland JC-120" },
  { id: "TWIN",       name: "Twin",             description: "Models a Fender Twin Reverb — clean, bright, airy American tone.", models: "Fender Twin Reverb" },
  { id: "DELUXE",     name: "Deluxe",           description: "Models a Fender Deluxe Reverb — warm clean tone with sweet natural breakup.", models: "Fender Deluxe Reverb" },
  { id: "TWEED",      name: "Tweed",            description: "Models a Fender Bassman 4x10\" Combo — full, warm tweed character.", models: "Fender Bassman 4x10\" Combo" },
  { id: "DIAMOND",    name: "Diamond",          description: "Models a VOX AC30 — chime, jangle, and natural top-end sparkle.", models: "VOX AC30" },
  { id: "BRIT STACK", name: "British Stack",    description: "Models a Marshall 1959 — classic British stack crunch and power.", models: "Marshall 1959 Super Lead" },
  { id: "RECTI STACK", name: "Rectifier Stack", description: "Models the Channel 2 MODERN Mode on the MESA/Boogie DUAL Rectifier — heavy, scooped modern metal tone.", models: "MESA/Boogie DUAL Rectifier" },
  { id: "MATCH",      name: "Matchless",        description: "Models the sound of the left input on a Matchless D/C-30 — chimey, articulate, touch-sensitive clean.", models: "Matchless D/C-30" },
  { id: "BG COMBO",   name: "BG Combo",         description: "Models the sound of the MESA/Boogie combo amp — warm clean with bold overdrive.", models: "MESA/Boogie combo" },
  { id: "ORNG STACK", name: "Orange Stack",     description: "Models the dirty channel of an ORANGE ROCKERVERB — thick, warm British overdrive.", models: "Orange Rockerverb" },
  { id: "BGNR UB",    name: "Bogner Überschall", description: "Models the high-gain channel of a Bogner Uberschall — tight, aggressive, high-gain German tone.", models: "Bogner Uberschall" },
];

// ---------------------------------------------------------------------------
// Speaker cabinets
// ---------------------------------------------------------------------------

const CAB_ITEMS: CapabilityItem[] = [
  { id: "OFF",      name: "Off",     description: "Speaker simulator disabled." },
  { id: "ORIGINAL", name: "Original", description: "Built-in speaker of the selected amp type." },
  { id: '1x8"',    name: '1×8"',    description: "Compact open-back cabinet with one 8-inch speaker." },
  { id: '1x10"',   name: '1×10"',   description: "Compact open-back cabinet with one 10-inch speaker." },
  { id: '1x12"',   name: '1×12"',   description: "Open-back cabinet with one 12-inch speaker." },
  { id: '2x12"',   name: '2×12"',   description: "Open-back cabinet with two 12-inch speakers." },
  { id: '4x10"',   name: '4×10"',   description: "Open-back cabinet with four 10-inch speakers." },
  { id: '4x12"',   name: '4×12"',   description: "Enclosed cabinet with four 12-inch speakers — the classic large stack cabinet." },
  { id: '8x12"',   name: '8×12"',   description: "Double stack — two 4×12\" cabinets stacked." },
  { id: "USER1",   name: "User 1",  description: "User-loaded IR (Impulse Response) cabinet." },
  { id: "USER2",   name: "User 2",  description: "User-loaded IR cabinet." },
  { id: "USER3",   name: "User 3",  description: "User-loaded IR cabinet." },
  { id: "USER4",   name: "User 4",  description: "User-loaded IR cabinet." },
  { id: "USER5",   name: "User 5",  description: "User-loaded IR cabinet." },
  { id: "USER6",   name: "User 6",  description: "User-loaded IR cabinet." },
  { id: "USER7",   name: "User 7",  description: "User-loaded IR cabinet." },
  { id: "USER8",   name: "User 8",  description: "User-loaded IR cabinet." },
];

// ---------------------------------------------------------------------------
// Microphones
// ---------------------------------------------------------------------------

const MIC_ITEMS: CapabilityItem[] = [
  { id: "DYN57",   name: "Dynamic 57",   description: "Models the Shure SM57 — the standard dynamic mic for guitar amplifiers.", models: "Shure SM57" },
  { id: "DYN421",  name: "Dynamic 421",  description: "Models the Sennheiser MD-421 — dynamic mic with extended low end.", models: "Sennheiser MD-421" },
  { id: "CND451",  name: "Condenser 451", description: "Models the AKG C451B — small condenser mic for instruments, adds detail and air.", models: "AKG C451B" },
  { id: "CND87",   name: "Condenser 87",  description: "Models the Neumann U87 — large condenser with a flat, natural response.", models: "Neumann U87" },
  { id: "FLAT",    name: "Flat",          description: "Simulates a perfectly flat-response mic — sonic image close to listening to the speaker directly." },
  { id: "RIBON121", name: "Ribbon 121",  description: "Models the Royer R-121 ribbon mic — warm, natural, dark character.", models: "Royer R-121" },
  { id: "BLEND A", name: "Blend A",      description: "SM57 and Royer R-121 blended — SM57 proportionally louder. Bright with warmth.", models: "Shure SM57 + Royer R-121 (SM57 dominant)" },
  { id: "BLEND B", name: "Blend B",      description: "SM57 and Royer R-121 blended at equal volumes — balanced brightness and warmth.", models: "Shure SM57 + Royer R-121 (equal mix)" },
  { id: "BLEND C", name: "Blend C",      description: "SM57 and Royer R-121 blended — R-121 proportionally louder. Warmer and darker.", models: "Shure SM57 + Royer R-121 (R-121 dominant)" },
];

// ---------------------------------------------------------------------------
// Delay types
// ---------------------------------------------------------------------------

const DELAY_ITEMS: CapabilityItem[] = [
  { id: "STANDARD",    name: "Standard",    description: "Classic digital delay — delays the sound to create an echo-like effect." },
  { id: "MODULATE",    name: "Modulate",    description: "Delay with modulation added to the repeats, giving a warm wavering quality." },
  { id: "PAN",         name: "Pan",         description: "Stereo ping-pong delay — divides delay time between L and R channels." },
  { id: "REVERSE",     name: "Reverse",     description: "Reverses the delayed signal, creating a backwards playback effect." },
  { id: "ANALOG",      name: "Analog",      description: "Mild analog-style delay with naturally darkening repeats." },
  { id: "ANLG MOD",    name: "Analog Mod",  description: "Analog delay with pleasant modulation on the repeats." },
  { id: "SPACE ECHO",  name: "Space Echo",  description: "Models the Roland RE-201 Space Echo tape delay.", models: "Roland RE-201 Space Echo" },
  { id: "SHIMMER",     name: "Shimmer",     description: "Delay with pitch-shifted sound mixed into the repeats — ethereal, shimmering character." },
  { id: "WARP",        name: "Warp",        description: "Dream-like, time-stretching delay effect." },
  { id: "TWIST",       name: "Twist",       description: "Aggressive rotational delay effect — works well with distortion for extreme sounds." },
  { id: "GLITCH",      name: "Glitch",      description: "Machine gun-like stuttering delay effect." },
];

// ---------------------------------------------------------------------------
// Reverb types
// ---------------------------------------------------------------------------

const REV_ITEMS: CapabilityItem[] = [
  { id: "HALL S",    name: "Hall S",    description: "Concert hall reverb — clear and spacious, short tail." },
  { id: "HALL M",    name: "Hall M",    description: "Concert hall reverb — mild, medium tail." },
  { id: "PLATE",     name: "Plate",     description: "Plate reverb — metallic character with a distinct upper range, dense early reflections." },
  { id: "ROOM S",    name: "Room S",    description: "Small room reverb — warm, intimate reflections." },
  { id: "ROOM L",    name: "Room L",    description: "Larger room reverb — more spacious than ROOM S." },
  { id: "AMBIENCE",  name: "Ambience",  description: "Off-mic ambience mic simulation — a sense of openness and depth rather than obvious reverb." },
  { id: "SPRING",    name: "Spring",    description: "Simulates the built-in spring reverb of a guitar amplifier — drip and bounce character." },
  { id: "SHIMMER",   name: "Shimmer",   description: "Reverb with pitch-shifted harmonics — ethereal, sparkling high-frequency reverberation." },
  { id: "SUB DELAY", name: "Sub Delay", description: "Long delay (up to 2000 ms) used as a reverb-in-series to add depth." },
  { id: "TERA ECHO", name: "Tera Echo", description: "MDP-powered unique ambience that changes character in response to picking dynamics." },
];

// ---------------------------------------------------------------------------
// Assembled DeviceCapabilities
// ---------------------------------------------------------------------------

const gx1Capabilities: DeviceCapabilities = {
  groups: [
    {
      id: "fx",
      name: "FX1/FX2/FX3",
      description: "Three independent effects slots in the signal chain. FX1 and FX2 can use any of the 38 effects; FX3 additionally supports OVERTONE.",
      items: FX_ITEMS as unknown as CapabilityItem[],
    },
    {
      id: "odds",
      name: "OD/DS",
      description: "Dedicated overdrive/distortion block with 35 classic pedal models. Always in the signal chain (can be bypassed).",
      items: ODDS_ITEMS,
      params: [
        { name: "DRIVE",  range: "1–120",   description: "Depth of distortion." },
        { name: "TONE",   range: "–50–+50", description: "Tonal character." },
        { name: "LEVEL",  range: "0–100",   description: "Volume of the effect sound." },
        { name: "DIRECT", range: "0–100",   description: "Volume of the direct signal." },
      ],
    },
    {
      id: "amp",
      name: "AMP/CAB",
      description: "AIRD (Augmented Impulse Response Dynamics) amplifier simulation. Models the full amp circuit including preamp, power section, and speaker interaction.",
      items: AMP_ITEMS,
      params: [
        { name: "GAIN",   range: "0–120", description: "Amp distortion/gain." },
        { name: "BASS",   range: "0–100", description: "Low-frequency tone (50 = flat)." },
        { name: "MIDDLE", range: "0–100", description: "Midrange balance (50 = flat)." },
        { name: "TREBLE", range: "0–100", description: "High-frequency tone (50 = flat)." },
        { name: "LEVEL",  range: "0–100", description: "Overall preamp output volume." },
      ],
    },
    {
      id: "cab",
      name: "Speaker Cabinet",
      description: "Speaker cabinet simulation applied to the amp signal. Selects the cabinet size and configuration, or an externally loaded IR.",
      items: CAB_ITEMS,
    },
    {
      id: "mic",
      name: "Microphone",
      description: "Microphone simulation applied after the speaker cabinet — shapes the tonal character of the miked cab signal.",
      items: MIC_ITEMS,
    },
    {
      id: "ns",
      name: "NS (Noise Suppressor)",
      description: "Reduces noise and hum picked up by guitar pickups. Responds to the guitar signal envelope so it doesn't cut sustain unnaturally.",
      items: [],
      params: [
        { name: "THRESHOLD", range: "0–100",      description: "Level above which noise suppression activates." },
        { name: "RELEASE",   range: "0–100",      description: "Time for noise to reach silence after suppression begins." },
        { name: "DETECT",    range: "INPUT, NS INPUT", description: "Which signal point drives the detector — INPUT for normal use; NS INPUT when you want delay/reverb tails to survive the NS." },
      ],
    },
    {
      id: "fv",
      name: "FV (Foot Volume)",
      description: "Expression-pedal volume control. Typically assigned to the CTL 2/EXP 2 jack.",
      items: [],
      params: [
        { name: "POSITION", range: "0–100",                description: "Current volume position." },
        { name: "MIN",      range: "0–100",                description: "Volume at heel position (pedal fully raised)." },
        { name: "MAX",      range: "0–100",                description: "Volume at toe position (pedal fully depressed)." },
        { name: "CURVE",    range: "SLOW1, SLOW2, NORMAL, FAST", description: "Volume response curve — how volume changes relative to pedal movement." },
      ],
    },
    {
      id: "delay",
      name: "Delay",
      description: "Dedicated delay block — adds echoes and depth to the signal. 11 delay types from classic digital to creative special effects.",
      items: DELAY_ITEMS,
      params: [
        { name: "TIME",     range: "1–2000 ms, BPM", description: "Delay time." },
        { name: "FEEDBACK", range: "0–100",           description: "Number of repeats." },
        { name: "LEVEL",    range: "1–120",           description: "Volume of the delay sound." },
        { name: "HIGH CUT", range: "20 Hz–12.5 kHz, FLAT", description: "High-cut filter on delay repeats." },
        { name: "DIRECT",   range: "0–100",           description: "Volume of the direct signal." },
      ],
    },
    {
      id: "reverb",
      name: "Reverb",
      description: "Dedicated reverb block — adds reverberation. 10 types from natural acoustic spaces to creative shimmer and echo effects.",
      items: REV_ITEMS,
      params: [
        { name: "TIME",      range: "0.1–10.0 s", description: "Reverb decay time." },
        { name: "TONE",      range: "–50–+50",    description: "Tonal character of the reverb." },
        { name: "DENSITY",   range: "1–10",       description: "Density of the reverb." },
        { name: "PRE-DELAY", range: "0–200 ms",   description: "Time until the reverb sound starts." },
        { name: "LEVEL",     range: "1–100",      description: "Volume of the reverb sound." },
        { name: "DIRECT",    range: "0–100",      description: "Volume of the direct signal." },
      ],
    },
  ],
};

export { gx1Capabilities };
