/**
 * GX-1 capability/description data.
 *
 * This module owns the *structural + sonic* metadata for each block: item ids/names, sonic
 * descriptions, the real-world `models` an item emulates, and nested subTypes. It does NOT
 * own parameter data: every `params` list is derived from `param-catalog.ts` (the single
 * source of truth for the device's param surface). Item `id` values must match the string
 * constants in `constants.ts` (which drive the codec).
 *
 * This assembled object is what the CLI (`capabilities` command) and MCP (`describe_device`
 * tool) consume. The drift-guard tests in `capabilities.test.ts` enforce that the catalog
 * (and therefore the params surfaced here) stays in lockstep with the codec's field maps.
 */
import type {
  DeviceCapabilities, CapabilityGroup, CapabilityItem, ParamSpec, PatchSpecExample,
} from "../../types";
import { PARAMS_BY_TYPE, PARAMS_BY_BLOCK, FIELD_LABEL_ALIASES, type PerTypeBlockId } from "./param-catalog";
import { DEFAULTS_BY_TYPE, BLOCK_DEFAULTS, DEFAULT_SUBTYPES } from "./defaults";
import type { ParamDefaults, BlockDefaults } from "./defaults";
import { BLOCK_GROUPS, NESTED_PARAMS, NAME_BYTES, onlyBlockFor } from "./common";
import { PFX_TYPE_MAPS, DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES } from "./codec/blocks";
import { FX_PARAM_MAPS, FX_DELAY_TYPE_MAPS } from "./codec/fx-params";
import type { FieldCodec } from "./codec/fields";
import { DEFAULT_CHAIN } from "./builder";

const normalizeLabel = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]/g, "");

const PER_TYPE_CODEC_MAPS: Record<PerTypeBlockId, Partial<Record<string, readonly FieldCodec[]>>> = {
  fx: FX_PARAM_MAPS, pfx: PFX_TYPE_MAPS, delay: DELAY_TYPE_MAPS,
  reverb: REV_TYPE_MAPS, fxDelay: FX_DELAY_TYPE_MAPS,
};

const codecFieldsFor = (block: PerTypeBlockId, type: string): readonly FieldCodec[] => {
  // Every reverb type but the STANDARD group shares STANDARD's field map.
  const resolvedType = block === "reverb" && (STANDARD_REVERB_TYPES as readonly string[]).includes(type)
    ? "STANDARD"
    : type;
  return PER_TYPE_CODEC_MAPS[block][resolvedType] ?? [];
};

/** Stamps each catalog param with its backing codec field name (`key`), matched by label. */
const withKeys = (block: PerTypeBlockId, type: string, params: readonly ParamSpec[]): ParamSpec[] => {
  const fields = codecFieldsFor(block, type);
  const aliases = FIELD_LABEL_ALIASES[block][type] ?? {};
  return params.map(param => {
    const target = normalizeLabel(param.name);
    const field = fields.find(candidate => normalizeLabel(aliases[candidate.name] ?? candidate.name) === target);
    const stamped = field ? { ...param, key: field.name } : param;
    return stamped;
  });
};

/**
 * Stamps `key` on a single-shape block's params. These blocks are hand-decoded rather than built
 * from a FieldCodec map, so there is no field list to match against: the decoded field name is the
 * catalog label lower-cased and camel-cased ("SOLO LEVEL" → soloLevel). The catalog-completeness
 * guard checks every stamped key against a real decoded block, so this stays derived, not assumed.
 */
const withBlockKeys = (params: readonly ParamSpec[]): ParamSpec[] =>
  params.map(param => {
    const [head, ...rest] = param.name.toLowerCase().split(" ");
    const key = head + rest.map(word => word[0].toUpperCase() + word.slice(1)).join("");
    return { ...param, key };
  });

/** Attaches each item's params (with `key` stamped on) from the catalog for a per-type block. */
const withTypeParams = (block: PerTypeBlockId, items: readonly CapabilityItem[]): CapabilityItem[] =>
  items.map(item => ({ ...item, params: withKeys(block, item.id, PARAMS_BY_TYPE[block][item.id] ?? []) }));

// FX-slot DELAY is the one fx type modeled per-sub-algorithm: its subTypes carry the params
// (from the "fxDelay" catalog block), unlike the flat fx types whose params sit on the item.
const FX_DELAY_SUBTYPES: CapabilityItem[] = withTypeParams("fxDelay", [
  { id: "STANDARD", name: "Standard", description: "Classic digital delay: repeats the sound to create an echo." },
  { id: "MODULATE", name: "Modulate", description: "Delay with modulation added to the repeats, giving a warm wavering quality." },
  { id: "WARP",     name: "Warp",     description: "Dream-like, time-stretching delay effect." },
  { id: "TWIST",    name: "Twist",    description: "Aggressive rotational delay effect. Works well with distortion for extreme sounds." },
  { id: "GLITCH",   name: "Glitch",   description: "Machine gun-like stuttering delay effect." },
]);

// ---------------------------------------------------------------------------
// FX1/FX2/FX3 structural metadata (params come from the catalog)
// ---------------------------------------------------------------------------

const FX_META: CapabilityItem[] = [
  {
    id: "COMPRESSOR",
    name: "Compressor",
    description: "Produces a long sustain by evening out the volume level of the input signal. Attenuates loud peaks and boosts quiet signals.",
    subTypes: [
      { id: "BOSS COMP", name: "BOSS Comp", description: "Models a BOSS CS-3.", models: "BOSS CS-3" },
      { id: "D-COMP",    name: "D-Comp",    description: "Models a MXR Dyna Comp.", models: "MXR Dyna Comp" },
      { id: "ORANGE",    name: "Orange",    description: "Modeled on the Dan Armstrong ORANGE SQUEEZER.", models: "Dan Armstrong Orange Squeezer" },
      { id: "X-COMP",    name: "X-Comp",    description: "Uses MDP (Multi-Dimensional Processing) for a consistently natural feel across the pitch and dynamic range." },
      { id: "STEREO",    name: "Stereo",    description: "Stereo compressor: applies compression equally to both left and right channels." },
    ],
  },
  {
    id: "LIMITER",
    name: "Limiter",
    description: "Attenuates loud input levels to prevent distortion, acting as a ceiling on the signal level.",
    subTypes: [
      { id: "BOSS",       name: "BOSS",           description: "Stereo limiter with a clean, general-purpose character." },
      { id: "RACK 160D",  name: "Rack 160D",      description: "Models a dbx 160X.", models: "dbx 160X" },
      { id: "VTG RACK U", name: "Vintage Rack U", description: "Models a UREI 1178.", models: "UREI 1178" },
    ],
  },
  {
    id: "ENHANCER",
    name: "Enhancer",
    description: "Emphasizes the attack portion of the sound in response to input level changes, adding definition and presence to the audio.",
  },
  {
    id: "TOUCH WAH",
    name: "Touch Wah",
    description: "Wah effect where the filter responds to changes in guitar volume, so picking harder opens the filter.",
  },
  {
    id: "AUTO WAH",
    name: "Auto Wah",
    description: "Wah effect that sweeps the filter automatically over a periodic cycle, producing a rhythmic envelope-filter sound.",
  },
  {
    id: "FIXED WAH",
    name: "Fixed Wah",
    description: "Static wah effect: the pedal stops at a fixed midrange position, producing a vowel-filter tone.",
    subTypes: [
      { id: "CRY WAH",   name: "Cry Wah",      description: "Models the CRY BABY wah pedal popular in the '70s.", models: "Dunlop Cry Baby" },
      { id: "VO WAH",    name: "Vox Wah",      description: "Models the VOX V846.", models: "VOX V846" },
      { id: "FAT WAH",   name: "Fat Wah",      description: "Wah with a bold, thick tone." },
      { id: "LIGHT WAH", name: "Light Wah",    description: "Refined wah sound with no unusual characteristics: clean and subtle." },
      { id: "7STR WAH",  name: "7-String Wah", description: "Extended range wah compatible with seven-string and baritone guitars." },
      { id: "RESO WAH",  name: "Reso Wah",     description: "Completely original wah enhancing the characteristic resonances of analog synth filters." },
    ],
  },
  {
    id: "DEFRETTER",
    name: "Defretter",
    description: "Simulates a fretless guitar by softening the attack and adding the characteristic slide between notes.",
  },
  {
    id: "SLOW GEAR",
    name: "Slow Gear",
    description: "Volume-swell effect that produces a violin-like sound by softening the attack of each note.",
  },
  {
    id: "AC. GTR SIM",
    name: "Acoustic Guitar Simulator",
    description: "Simulates the tonal character of an acoustic guitar from an electric guitar input.",
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
  },
  {
    id: "SITAR SIM",
    name: "Sitar Simulator",
    description: "Simulates the distinctive sound of the sitar, including its characteristic buzz and drone resonance.",
  },
  {
    id: "FEEDBACKER",
    name: "Feedbacker",
    description: "Generates sustained guitar feedback on demand. Can analyze pitch (NORMAL) or create an internally-generated simulated feedback tone (OSC).",
  },
  {
    id: "OD/DS",
    name: "Overdrive/Distortion",
    description: "Overdrive and distortion effect that distorts the sound to create sustain. The type selects from 35 classic pedal models. The dedicated odds block carries the same 35 models and is where a patch's overdrive belongs; reach for an fx slot when you want a second overdrive stacked on top of it.",
    subTypes: [
      { id: "MID BOOST",   name: "Mid Boost",     description: "Booster with unique midrange characteristics. Good for solos placed before the amp." },
      { id: "CLEAN BST",   name: "Clean Boost",   description: "Booster with a punchy clean tone." },
      { id: "TREBLE BST",  name: "Treble Boost",  description: "Bright booster with treble emphasis." },
      { id: "NATURAL OD",  name: "Natural OD",    description: "Natural-feeling overdrive distortion." },
      { id: "WARM OD",     name: "Warm OD",       description: "Warm, round overdrive." },
      { id: "BLUES OD",    name: "Blues OD",      description: "Crunch sound of the BOSS BD-2, faithfully reproducing picking nuances.", models: "BOSS BD-2" },
      { id: "OVERDRIVE",   name: "Overdrive",     description: "BOSS OD-1 type drive with sweet, mild distortion.", models: "BOSS OD-1" },
      { id: "CRUNCH",      name: "Crunch",        description: "Lustrous crunch sound with amp distortion character." },
      { id: "T-SCREAM",    name: "T-Scream",      description: "Models an Ibanez TS-808 Tube Screamer.", models: "Ibanez TS-808" },
      { id: "TURBO OD",    name: "Turbo OD",      description: "High-gain overdrive sound of the BOSS OD-2.", models: "BOSS OD-2" },
      { id: "CENTA OD",    name: "Centaur OD",    description: "Models a KLON CENTAUR.", models: "KLON CENTAUR" },
      { id: "X-OD",        name: "X-OD",          description: "MDP overdrive with ideal distortion across all pitch ranges." },
      { id: "DIST",        name: "Distortion",    description: "Basic, traditional distortion sound." },
      { id: "A-DIST",      name: "A-Dist",        description: "MDP distortion, ideal across all guitar ranges from low to high." },
      { id: "FAT DS",      name: "Fat DS",        description: "Distortion with thick, heavy character." },
      { id: "LEAD DS",     name: "Lead DS",       description: "Combines overdrive smoothness with deep distortion. Good for leads." },
      { id: "RAT",         name: "RAT",           description: "Models a Proco RAT.", models: "Proco RAT" },
      { id: "GUV DS",      name: "Guv'nor DS",    description: "Models a Marshall GUV'NOR.", models: "Marshall GUV'NOR" },
      { id: "DIST+",       name: "Dist+",         description: "Models a MXR DISTORTION+.", models: "MXR DISTORTION+" },
      { id: "X-DIST",      name: "X-Dist",        description: "MDP distortion optimized for each pitch range." },
      { id: "METAL DS",    name: "Metal DS",      description: "Distortion ideal for heavy riffs." },
      { id: "METAL ZONE",  name: "Metal Zone",    description: "BOSS MT-2 type wide-ranging metal sound.", models: "BOSS MT-2" },
      { id: "HVY METAL",   name: "Heavy Metal",   description: "BOSS HM-2 type: compressed distortion like a cranked-up amp.", models: "BOSS HM-2" },
      { id: "METAL CORE",  name: "Metal Core",    description: "BOSS ML-2 type, optimal for high-speed metal riffs.", models: "BOSS ML-2" },
      { id: "OCT FUZZ",    name: "Oct Fuzz",      description: "Fuzz sound with rich harmonic content and an octave character." },
      { id: "60S FUZZ",    name: "60s Fuzz",      description: "Models a FUZZFACE for a fat, vintage fuzz sound.", models: "Dallas Arbiter Fuzz Face" },
      { id: "MUFF FUZZ",   name: "Muff Fuzz",     description: "Models an Electro-Harmonix Big Muff π.", models: "Electro-Harmonix Big Muff π" },
      { id: "BASS OD",     name: "Bass OD",       description: "Overdrive tuned for bass guitar." },
      { id: "X-BASS OD",   name: "X-Bass OD",     description: "MDP overdrive providing ideal distortion across all bass pitch ranges." },
      { id: "BASS DS",     name: "Bass DS",       description: "Distortion tuned for bass guitar." },
      { id: "BASS DI",     name: "Bass DI",       description: "Models a MXR Bass D.I.+.", models: "MXR Bass D.I.+" },
      { id: "SA DI DRIVE", name: "SA DI Drive",   description: "Models a TECH21 SANSAMP BASS DRIVER DI.", models: "TECH21 SansAmp Bass Driver DI" },
      { id: "HI BAND DRV", name: "Hi Band Drive", description: "Distortion applied only to high frequencies, so the low end stays strong." },
      { id: "BASS MT",     name: "Bass MT",       description: "Wild, radical distortion for bass." },
      { id: "BASS FUZZ",   name: "Bass Fuzz",     description: "Fuzz tuned for bass guitar." },
    ],
  },
  { id: "PARA. EQ",  name: "Parametric EQ",  description: "Three-band parametric equalizer with adjustable center frequency for the mid band." },
  { id: "GEQ",       name: "Graphic EQ",     description: "Six-band graphic equalizer covering the full frequency range (125 Hz - 4 kHz)." },
  { id: "LOW GEQ",   name: "Low Graphic EQ", description: "Six-band graphic equalizer focused on lower frequencies (63 Hz - 2 kHz)." },
  { id: "HIGH GEQ",  name: "High Graphic EQ", description: "Six-band graphic equalizer focused on higher frequencies (250 Hz - 8 kHz)." },
  {
    id: "CHORUS",
    name: "Chorus",
    description: "Adds a slightly pitch-modulated copy of the signal to create spaciousness, depth, and a shimmering quality.",
    subTypes: [
      { id: "MONO",    name: "Mono",    description: "Mono chorus: the same sound from both L and R channels." },
      { id: "DIR/EFX", name: "Dir/Efx", description: "Stereo chorus using spatial synthesis: direct in L, effect in R." },
      { id: "STEREO",  name: "Stereo",  description: "Stereo chorus: a different chorus applied to L and R channels." },
    ],
  },
  { id: "FLANGER", name: "Flanger", description: "Gives a twisting, jet-airplane-like character to the sound by sweeping a comb-filtered copy against the original." },
  { id: "PHASER",  name: "Phaser",  description: "Gives a whooshing, swirling character by adding phase-shifted copies to the direct sound. Number of stages selects between 4, 8, or 12-stage phasing." },
  {
    id: "SCRIPT PH",
    name: "Script Phaser",
    description: "Models the MXR Phase 90 manufactured during the '70s, a classic 4-stage phaser with a warm, organic character.",
    models: "MXR Phase 90 (script logo era)",
  },
  {
    id: "CLASSIC-VIBE",
    name: "Classic Vibe",
    description: "Resembles a phaser but provides a unique undulation that a regular phaser cannot achieve: the rotary-speaker-like Uni-Vibe character.",
    subTypes: [
      { id: "CHORUS",  name: "Chorus",  description: "Direct sound and effect sound are mixed together." },
      { id: "VIBRATO", name: "Vibrato", description: "Only the effect sound is output, for full pitch modulation." },
    ],
  },
  { id: "ROTARY",  name: "Rotary",  description: "Simulates the sound of a rotating speaker (Leslie cabinet), with separate slow and fast speed settings." },
  { id: "VIBRATO", name: "Vibrato", description: "Creates vibrato by cyclically modulating the pitch, similar to a guitarist's finger vibrato but more precise and consistent." },
  { id: "TREMOLO", name: "Tremolo", description: "Creates a cyclic change in volume, from subtle pulsing to choppy amplitude modulation." },
  { id: "SLICER",  name: "Slicer",  description: "Rhythmically interrupts the sound using pattern-based slicing, creating an effect like a stutter or choppy arpeggio backing phrase." },
  { id: "PAN",     name: "Pan",     description: "Alternately changes the left/right volume in stereo, making the guitar sound appear to fly back and forth between speakers." },
  { id: "RING MOD", name: "Ring Modulator", description: "Creates a bell-like sound by ring-modulating the guitar signal with an internal oscillator. The result can be atonal and percussive." },
  {
    id: "HUMANIZER",
    name: "Humanizer",
    description: "Alters the guitar signal to produce human-like vocalized sounds by cycling between two selectable vowels.",
    subTypes: [
      { id: "PICKING", name: "Picking", description: "Picking triggers the vowel change." },
      { id: "AUTO",    name: "Auto",    description: "Vowels switch automatically based on rate and depth." },
    ],
  },
  { id: "PITCH SHIFT", name: "Pitch Shifter", description: "Changes the pitch of the original sound up or down within a range of two octaves." },
  { id: "HARMONIST",   name: "Harmonist",     description: "Adds a pitch-shifted harmony voice based on analysis of the guitar input and a selected musical key, allowing diatonic harmonies." },
  { id: "OCTAVE",      name: "Octave",        description: "Adds notes one and two octaves lower than the input, creating a richer, fuller sound. Tracks single notes only." },
  { id: "HEAVY OCT",   name: "Heavy Octave",  description: "Adds notes one and two octaves lower, like the Octave effect, but also works polyphonically, so it applies to chords as well as single notes." },
  { id: "S-BEND",      name: "S-Bend",        description: "Gives a pitch-shift up or down effect in octave steps, triggered on demand, simulating extreme vibrato-bar techniques." },
  { id: "PEDAL BEND",  name: "Pedal Bend",    description: "Expression-pedal-controlled pitch bend effect: heel sets the minimum pitch, toe sets the maximum." },
  { id: "TUNE DOWN",   name: "Tune Down",     description: "Gives the effect of tuning the guitar lower by up to 12 semitones, without retuning. Best used with single notes." },
  {
    id: "DELAY",
    name: "Delay (FX slot)",
    description: "Delay effect in the FX slot. Adds delayed sound for echo, depth, or special effects. The sub-algorithm selects which controls are available.",
    subTypes: FX_DELAY_SUBTYPES,
  },
  {
    id: "REVERB",
    name: "Reverb (FX slot)",
    description: "Reverb effect in the FX slot. Adds reverberation to the sound; the subtype selects the reverb algorithm.",
    subTypes: [
      { id: "HALL S", name: "Hall S", description: "Concert hall reverb, clear and spacious with a short tail." },
      { id: "HALL M", name: "Hall M", description: "Concert hall reverb, mild with a medium tail." },
      { id: "PLATE",  name: "Plate",  description: "Plate reverb: metallic character with a distinct upper range and dense early reflections." },
      { id: "ROOM",   name: "Room",   description: "Room reverb with warm, intimate reflections." },
      { id: "STUDIO", name: "Studio", description: "Studio reverb with the tight ambience of a recording room." },
    ],
  },
  { id: "OVERTONE",    name: "Overtone",      description: "FX3 only. Uses MDP technology to add new harmonics to the sound, producing richness and resonance not present in the original. Adds octave-up, octave-down, and detuned unison voices." },
];

const FX_ITEMS = withTypeParams("fx", FX_META);

// ---------------------------------------------------------------------------
// OD/DS block: same models as the FX OD/DS subtype list
// ---------------------------------------------------------------------------

const oddsFxItem = FX_META.find(item => item.id === "OD/DS");
if (!oddsFxItem?.subTypes) throw new Error('"OD/DS" pedal models not found in FX_META');
const ODDS_ITEMS = oddsFxItem.subTypes;

// ---------------------------------------------------------------------------
// AMP models
// ---------------------------------------------------------------------------

const AMP_ITEMS: CapabilityItem[] = [
  { id: "TRNSPRNT",    name: "Transparent",       description: "Extremely flat response across a broad frequency range. Good for acoustic guitar or any signal where you want zero amp coloration." },
  { id: "NATURAL",     name: "Natural",           description: "Clean, unembellished sound that minimizes amp idiosyncrasies like treble harshness or boomy lows." },
  { id: "BOUTIQUE",    name: "Boutique",          description: "Crunch sound that allows picking nuances to come through even more faithfully than on conventional combo amps." },
  { id: "SUPREME",     name: "Supreme",           description: "Great-feeling crunch sound that responds to picking nuances and takes advantage of the character of a 4x12\" cabinet." },
  { id: "MAXIMUM",     name: "Maximum",           description: "Delivers the response and tone of a vintage Marshall while pushing it to even higher gain.", models: "Marshall (high-gain voiced)" },
  { id: "JUGGERNAUT",  name: "Juggernaut",        description: "Large stack sound tweaked extensively for the ultimate metal tone." },
  { id: "X-CRUNCH",    name: "X-Crunch",          description: "Crunch sound using MDP for a crisp, well-defined tone from all strings." },
  { id: "X-HI GAIN",   name: "X-Hi Gain",         description: "High-gain sound using MDP for a wide range and a great-feeling sense of note separation." },
  { id: "X-MODDED",    name: "X-Modded",          description: "Core sound using MDP, preserving definition even with extreme gain settings." },
  { id: "X-ULTRA",     name: "X-Ultra",           description: "High-gain MDP sound with a dense midrange tone and strong dynamics." },
  { id: "X-OPTIMA",    name: "X-Optima",          description: "High-gain MDP sound emphasizing sonic balance. Good for ensemble playing." },
  { id: "X-TITAN",     name: "X-Titan",           description: "Tight high-gain sound with an edge, using MDP." },
  { id: "JC-120",      name: "JC-120",            description: "Models the sound of the Roland JC-120: clean, bright, solid-state character.", models: "Roland JC-120" },
  { id: "TWIN",        name: "Twin",              description: "Models a Fender Twin Reverb for a clean, bright, airy American tone.", models: "Fender Twin Reverb" },
  { id: "DELUXE",      name: "Deluxe",            description: "Models a Fender Deluxe Reverb: warm clean tone with sweet natural breakup.", models: "Fender Deluxe Reverb" },
  { id: "TWEED",       name: "Tweed",             description: "Models a Fender Bassman 4x10\" Combo for a full, warm tweed character.", models: "Fender Bassman 4x10\" Combo" },
  { id: "DIAMOND",     name: "Diamond",           description: "Models a VOX AC30: chime, jangle, and natural top-end sparkle.", models: "VOX AC30" },
  { id: "BRIT STACK",  name: "British Stack",     description: "Models a Marshall 1959 for classic British stack crunch and power.", models: "Marshall 1959 Super Lead" },
  { id: "RECTI STACK", name: "Rectifier Stack",   description: "Models the Channel 2 MODERN Mode on the MESA/Boogie DUAL Rectifier: heavy, scooped modern metal tone.", models: "MESA/Boogie DUAL Rectifier" },
  { id: "MATCH",       name: "Matchless",         description: "Models the sound of the left input on a Matchless D/C-30: chimey, articulate, touch-sensitive clean.", models: "Matchless D/C-30" },
  { id: "BG COMBO",    name: "BG Combo",          description: "Models the sound of the MESA/Boogie combo amp: warm clean with bold overdrive.", models: "MESA/Boogie combo" },
  { id: "ORNG STACK",  name: "Orange Stack",      description: "Models the dirty channel of an ORANGE ROCKERVERB for thick, warm British overdrive.", models: "Orange Rockerverb" },
  { id: "BGNR UB",     name: "Bogner Überschall", description: "Models the high-gain channel of a Bogner Uberschall: tight, aggressive, high-gain German tone.", models: "Bogner Uberschall" },
];

// ---------------------------------------------------------------------------
// Speaker cabinets
// ---------------------------------------------------------------------------

const CAB_ITEMS: CapabilityItem[] = [
  { id: "OFF",      name: "Off",      description: "Speaker simulator disabled." },
  { id: "ORIGINAL", name: "Original", description: "Built-in speaker of the selected amp type." },
  { id: '1x8"',     name: '1x8"',     description: "Compact open-back cabinet with one 8-inch speaker." },
  { id: '1x10"',    name: '1x10"',    description: "Compact open-back cabinet with one 10-inch speaker." },
  { id: '1x12"',    name: '1x12"',    description: "Open-back cabinet with one 12-inch speaker." },
  { id: '2x12"',    name: '2x12"',    description: "Open-back cabinet with two 12-inch speakers." },
  { id: '4x10"',    name: '4x10"',    description: "Open-back cabinet with four 10-inch speakers." },
  { id: '4x12"',    name: '4x12"',    description: "Enclosed cabinet with four 12-inch speakers, the classic large stack cabinet." },
  { id: '8x12"',    name: '8x12"',    description: "Double stack: two 4x12\" cabinets." },
  { id: "USER1",    name: "User 1",   description: "User-loaded IR (Impulse Response) cabinet." },
  { id: "USER2",    name: "User 2",   description: "User-loaded IR cabinet." },
  { id: "USER3",    name: "User 3",   description: "User-loaded IR cabinet." },
  { id: "USER4",    name: "User 4",   description: "User-loaded IR cabinet." },
  { id: "USER5",    name: "User 5",   description: "User-loaded IR cabinet." },
  { id: "USER6",    name: "User 6",   description: "User-loaded IR cabinet." },
  { id: "USER7",    name: "User 7",   description: "User-loaded IR cabinet." },
  { id: "USER8",    name: "User 8",   description: "User-loaded IR cabinet." },
];

// ---------------------------------------------------------------------------
// Microphones
// ---------------------------------------------------------------------------

const MIC_ITEMS: CapabilityItem[] = [
  { id: "DYN57",    name: "Dynamic 57",    description: "Models the Shure SM57, the standard dynamic mic for guitar amplifiers.", models: "Shure SM57" },
  { id: "DYN421",   name: "Dynamic 421",   description: "Models the Sennheiser MD-421, a dynamic mic with extended low end.", models: "Sennheiser MD-421" },
  { id: "CND451",   name: "Condenser 451", description: "Models the AKG C451B, a small condenser mic for instruments that adds detail and air.", models: "AKG C451B" },
  { id: "CND87",    name: "Condenser 87",  description: "Models the Neumann U87, a large condenser with a flat, natural response.", models: "Neumann U87" },
  { id: "FLAT",     name: "Flat",          description: "Simulates a perfectly flat-response mic, giving a sonic image close to listening to the speaker directly." },
  { id: "RIBON121", name: "Ribbon 121",    description: "Models the Royer R-121 ribbon mic: warm, natural, dark character.", models: "Royer R-121" },
  { id: "BLEND A",  name: "Blend A",       description: "SM57 and Royer R-121 blended with the SM57 proportionally louder. Bright with warmth.", models: "Shure SM57 + Royer R-121 (SM57 dominant)" },
  { id: "BLEND B",  name: "Blend B",       description: "SM57 and Royer R-121 blended at equal volumes, balancing brightness and warmth.", models: "Shure SM57 + Royer R-121 (equal mix)" },
  { id: "BLEND C",  name: "Blend C",       description: "SM57 and Royer R-121 blended with the R-121 proportionally louder. Warmer and darker.", models: "Shure SM57 + Royer R-121 (R-121 dominant)" },
];

// ---------------------------------------------------------------------------
// Delay types (params per type come from the catalog)
// ---------------------------------------------------------------------------

const DELAY_META: CapabilityItem[] = [
  { id: "STANDARD",    name: "Standard",    description: "Classic digital delay: repeats the sound to create an echo." },
  { id: "MODULATE",    name: "Modulate",    description: "Delay with modulation added to the repeats, giving a warm wavering quality." },
  { id: "PAN",         name: "Pan",         description: "Stereo ping-pong delay that divides delay time between L and R channels." },
  { id: "REVERSE",     name: "Reverse",     description: "Reverses the delayed signal, creating a backwards playback effect." },
  { id: "ANALOG",      name: "Analog",      description: "Mild analog-style delay with naturally darkening repeats." },
  { id: "ANLG MOD",    name: "Analog Mod",  description: "Analog delay with pleasant modulation on the repeats." },
  { id: "SPACE ECHO",  name: "Space Echo",  description: "Models the Roland RE-201 Space Echo tape delay.", models: "Roland RE-201 Space Echo" },
  { id: "SHIMMER",     name: "Shimmer",     description: "Delay with pitch-shifted sound mixed into the repeats, for an ethereal, shimmering character." },
  { id: "WARP",        name: "Warp",        description: "Dream-like, time-stretching delay effect." },
  { id: "TWIST",       name: "Twist",       description: "Aggressive rotational delay effect. Works well with distortion for extreme sounds." },
  { id: "GLITCH",      name: "Glitch",      description: "Machine gun-like stuttering delay effect." },
];

// ---------------------------------------------------------------------------
// Reverb types (params per type come from the catalog)
// ---------------------------------------------------------------------------

const REV_META: CapabilityItem[] = [
  { id: "HALL S",    name: "Hall S",    description: "Concert hall reverb, clear and spacious with a short tail." },
  { id: "HALL M",    name: "Hall M",    description: "Concert hall reverb, mild with a medium tail." },
  { id: "PLATE",     name: "Plate",     description: "Plate reverb: metallic character with a distinct upper range and dense early reflections." },
  { id: "ROOM S",    name: "Room S",    description: "Small room reverb with warm, intimate reflections." },
  { id: "ROOM L",    name: "Room L",    description: "Larger room reverb, more spacious than ROOM S." },
  { id: "AMBIENCE",  name: "Ambience",  description: "Off-mic ambience mic simulation, giving a sense of openness and depth rather than obvious reverb." },
  { id: "SPRING",    name: "Spring",    description: "Simulates the built-in spring reverb of a guitar amplifier, drip and bounce included." },
  { id: "SHIMMER",   name: "Shimmer",   description: "Reverb with pitch-shifted harmonics, for ethereal, sparkling high-frequency reverberation." },
  { id: "SUB DELAY", name: "Sub Delay", description: "Long delay (up to 2000 ms) used as a reverb-in-series to add depth." },
  { id: "TERA ECHO", name: "Tera Echo", description: "MDP-powered unique ambience that changes character in response to picking dynamics." },
];

// ---------------------------------------------------------------------------
// PFX (expression pedal effect) types
// ---------------------------------------------------------------------------

const PFX_META: CapabilityItem[] = [
  {
    id: "WAH",
    name: "Wah",
    description: "Expression-pedal-controlled wah filter.",
    subTypes: [
      { id: "CRY WAH",   name: "Cry Wah",      description: "Models the CRY BABY wah pedal popular in the '70s.", models: "Dunlop Cry Baby" },
      { id: "VO WAH",    name: "Vox Wah",      description: "Models the VOX V846.", models: "VOX V846" },
      { id: "FAT WAH",   name: "Fat Wah",      description: "Wah with a bold, thick tone." },
      { id: "LIGHT WAH", name: "Light Wah",    description: "Refined wah sound with no unusual characteristics: clean and subtle." },
      { id: "7STR WAH",  name: "7-String Wah", description: "Extended range wah compatible with seven-string and baritone guitars." },
      { id: "RESO WAH",  name: "Reso Wah",     description: "Completely original wah enhancing the characteristic resonances of analog synth filters." },
    ],
  },
  {
    id: "PEDAL BEND",
    name: "Pedal Bend",
    description: "Expression-pedal-controlled pitch bend, like a whammy pedal.",
  },
];

// ---------------------------------------------------------------------------
// Spec examples
// ---------------------------------------------------------------------------

// Widened views of the defaults, so a group with none reads as undefined rather than as a lookup
// TypeScript believes always resolves.
const PER_TYPE_DEFAULTS: Partial<Record<string, BlockDefaults>> = { ...DEFAULTS_BY_TYPE };
const PER_BLOCK_DEFAULTS: Partial<Record<string, ParamDefaults>> = BLOCK_DEFAULTS;

/**
 * The catalog block holding an FX-slot DELAY sub-algorithm's params. That item is the one whose
 * params sit on its subTypes rather than on itself, so its example takes its values from here.
 */
const VARIANT_BLOCK: PerTypeBlockId = "fxDelay";

/**
 * The block key a group is written under in a patch spec, taken from the spec's own block map. The
 * three fx slots share the fx group, so the example names the first of them; the group's own
 * description is where the fact that there are three lives. A type the device offers in one slot
 * only names that slot instead, since the example is copied and has to be buildable as it stands.
 */
const specBlockFor = (group: string, type?: string): string | undefined => {
  const onlyBlock = type === undefined ? undefined : onlyBlockFor(type);
  if (onlyBlock !== undefined) return onlyBlock;
  return Object.entries(BLOCK_GROUPS).find(([, id]) => id === group)?.[0];
};

/** The defaults an example is filled with: per type where a block has types, per block where it doesn't. */
const defaultsFor = (group: string, type?: string): ParamDefaults | undefined => {
  const byType = PER_TYPE_DEFAULTS[group];
  if (byType === undefined) return PER_BLOCK_DEFAULTS[group];
  if (type === undefined) return undefined;
  return byType[type];
};

/** The sub-model a type opens on, for the types that have sub-models at all. */
const defaultSubType = (group: string, type?: string): string | undefined =>
  type === undefined ? undefined : DEFAULT_SUBTYPES[group]?.[type];

/**
 * The chosen sub-model's own catalog entry, for the item whose params sit on its subTypes rather
 * than on itself (FX-slot DELAY, whose sub-algorithms each take a different set). Everywhere else
 * the item holds the params and the sub-model only colors them.
 */
const variantParams = (item: CapabilityItem, subType: string): CapabilityItem | undefined => {
  if ((item.params?.length ?? 0) > 0) return undefined;
  return item.subTypes?.find(variant => variant.id === subType && (variant.params?.length ?? 0) > 0);
};

/** Every param key the chosen shape accepts: the block's shared controls, then the type's own. */
const acceptedKeys = (params: ParamSpec[]): Set<string> =>
  new Set(params.flatMap(param => (param.key === undefined ? [] : [param.key])));

/** Where an example's values come from: the sub-model's defaults where it owns the params, else the type's. */
const exampleValues = (group: string, item?: CapabilityItem, variant?: CapabilityItem): ParamDefaults | undefined =>
  variant === undefined ? defaultsFor(group, item?.id) : PER_TYPE_DEFAULTS[VARIANT_BLOCK]?.[variant.id];

/**
 * One block's spec fragment at factory defaults: the selection that picks its shape, then its
 * controls wherever that block keeps them.
 */
const exampleFor = (group: CapabilityGroup, item?: CapabilityItem): PatchSpecExample | undefined => {
  const block = specBlockFor(group.id, item?.id);
  if (block === undefined) return undefined;

  const selected = defaultSubType(group.id, item?.id);
  const variant = item === undefined || selected === undefined ? undefined : variantParams(item, selected);
  const values = exampleValues(group.id, item, variant);
  if (values === undefined) return undefined;

  // A sub-model selection is named on its own below, so the codec field carrying it is not one of
  // the type's param keys and drops out here along with any other stale default.
  const accepted = acceptedKeys([...(group.params ?? []), ...(item?.params ?? []), ...(variant?.params ?? [])]);
  const controls = Object.fromEntries(Object.entries(values).filter(([key]) => accepted.has(key)));

  const typeField = item === undefined ? {} : { type: item.id };
  const subTypeField = selected === undefined ? {} : { subType: selected };
  const body = NESTED_PARAMS.has(block) ? { params: controls } : controls;
  return { [block]: { ...typeField, ...subTypeField, ...body } };
};

// Both leave the key off entirely where the group names no block, rather than carrying an empty one.
const withItemExample = (group: CapabilityGroup, item: CapabilityItem): CapabilityItem => {
  const example = exampleFor(group, item);
  const decorated = example === undefined ? item : { ...item, example };
  return decorated;
};

const withGroupExample = (group: CapabilityGroup): CapabilityGroup => {
  const example = exampleFor(group);
  const decorated = example === undefined ? group : { ...group, example };
  return decorated;
};

/**
 * Attaches each block's example where a caller meets it: on every item for a group that offers
 * types, and on the group itself for one that doesn't, since that is the only view those have.
 */
const withExamples = (groups: CapabilityGroup[]): CapabilityGroup[] =>
  groups.map(group => {
    if (group.items.length === 0) return withGroupExample(group);
    return { ...group, items: group.items.map(item => withItemExample(group, item)) };
  });

// ---------------------------------------------------------------------------
// Assembled DeviceCapabilities
// ---------------------------------------------------------------------------

const gx1Capabilities: DeviceCapabilities = {
  chain: {
    defaultOrder: [...DEFAULT_CHAIN],
    description:
      "The signal chain is the ordered list of blocks the guitar signal passes through. Every block " +
      "is always in the chain. Its position and its on/off state are separate inputs, set " +
      "independently.\n\n" +
      "• Order: the chain is the complete list, first-to-last, naming every block below exactly " +
      "once. To rearrange, copy the default order and move what you want. Leave the chain out " +
      "entirely to take the default order. A chain missing a block is rejected, since leaving a " +
      "block out is not how it gets switched off.\n" +
      "• On/off: every block can be turned off except FV (Foot Volume), which is always active. To " +
      "leave a block off, leave its spec out of the patch: it takes no params, so you never have " +
      "to invent values for a block that isn't sounding. Pass on: false alongside the block's " +
      "settings when you want it off but those params kept behind the bypass, so it can be " +
      "switched on later with them intact.\n\n" +
      `Default order: ${DEFAULT_CHAIN.join(", ")}.`,
  },
  patchName: { maxLength: NAME_BYTES },
  groups: withExamples([
    {
      id: "fx",
      name: "FX1/FX2/FX3",
      description: "Three independent effects slots in the signal chain. FX1 and FX2 can use any of the 38 effects; FX3 additionally supports OVERTONE.",
      items: FX_ITEMS,
    },
    {
      id: "odds",
      name: "OD/DS",
      description: "Dedicated overdrive/distortion block with 35 classic pedal models. This is the block to use for a patch's overdrive. The fx slots offer the same 35 models under their OD/DS type, for stacking a second overdrive in the chain.",
      items: ODDS_ITEMS,
      params: withBlockKeys(PARAMS_BY_BLOCK.odds),
    },
    {
      id: "amp",
      name: "AMP/CAB",
      description: "AIRD (Augmented Impulse Response Dynamics) amplifier simulation. Models the full amp circuit including preamp, power section, and speaker interaction.",
      items: AMP_ITEMS,
      params: withBlockKeys(PARAMS_BY_BLOCK.amp),
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
      description: "Microphone simulation applied after the speaker cabinet, shaping the tonal character of the miked cab signal.",
      items: MIC_ITEMS,
    },
    {
      id: "pfx",
      name: "PFX (Expression Pedal Effect)",
      description: "The effect assigned to the expression pedal input: either a wah pedal or a pitch-bend pedal. Only one is active at a time.",
      items: withTypeParams("pfx", PFX_META),
    },
    {
      id: "ns",
      name: "NS (Noise Suppressor)",
      description: "Reduces noise and hum picked up by guitar pickups. Responds to the guitar signal envelope so it doesn't cut sustain unnaturally.",
      items: [],
      params: withBlockKeys(PARAMS_BY_BLOCK.ns),
    },
    {
      id: "fv",
      name: "FV (Foot Volume)",
      description: "Expression-pedal volume control. Typically assigned to the CTL 2/EXP 2 jack. The one chain block that's always active: it can't be bypassed.",
      items: [],
      params: withBlockKeys(PARAMS_BY_BLOCK.fv),
    },
    {
      id: "delay",
      name: "Delay",
      description: "Dedicated delay block that adds echoes and depth to the signal. 11 delay types from classic digital to creative special effects.",
      items: withTypeParams("delay", DELAY_META),
    },
    {
      id: "reverb",
      name: "Reverb",
      description: "Dedicated reverb block that adds reverberation. 10 types from natural acoustic spaces to creative shimmer and echo effects.",
      items: withTypeParams("reverb", REV_META),
    },
  ]),
};

export { gx1Capabilities };
