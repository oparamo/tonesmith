/**
 * Assembles a patch from input `spec/` has already validated against the capability catalog, the
 * only way anything reaches these functions. They check nothing again: the drift guards hold the
 * catalog and the codec field maps equal, so a key the catalog accepted is a field the codec writes.
 * What they add is the device's own factory value for every control the caller left out.
 */
import type { Patch, BlockParams, PatchSettings } from "./types";
import { blankPatch } from "./tsl";
import { PARAM_SUBTYPE_EFFECTS, PFX_SUBTYPE_EFFECTS, DEFAULT_CHAIN } from "./common";
import { DEFAULTS_BY_TYPE, BLOCK_DEFAULTS, DEFAULT_SUBTYPES } from "./defaults";
import type { ParamDefaults } from "./defaults";

/**
 * The patch-level inputs a spec may carry, each one optional: a blank patch already opens at the
 * device's own factory value for every setting, so an option left out means "keep that" rather
 * than "invent a default here".
 */
interface BasePatchOptions extends Partial<PatchSettings> {
  chain?: string[];
}

const basePatch = (name: string, options: BasePatchOptions = {}): Patch => {
  const patch = blankPatch(name);
  patch.chain = [...(options.chain ?? DEFAULT_CHAIN)];
  patch.memoryLevel = options.memoryLevel ?? patch.memoryLevel;
  patch.bpm = options.bpm ?? patch.bpm;
  patch.key = options.key ?? patch.key;
  patch.carryover = options.carryover ?? patch.carryover;
  patch.tempoHold = options.tempoHold ?? patch.tempoHold;
  return patch;
};

/**
 * A type's params at factory values, with what the caller supplied over the top. Built fresh rather
 * than merged into what the block already holds, so switching a block's type leaves none of the
 * previous type's fields behind: the types of one block share a byte range, and a stale `pitch` left
 * over from SHIMMER would read back as a control SUB DELAY does not have.
 */
const withDefaults = (defaults: ParamDefaults | undefined, params: BlockParams): BlockParams =>
  ({ ...defaults, ...params });

interface AmpOptions {
  type: string;
  on?: boolean;
  params?: BlockParams;
}

// The single-shape blocks assign into the params they already hold, since those carry every control
// the block has whatever it is set to, and every one of them is overwritten here.

const amp = (patch: Patch, options: AmpOptions): void => {
  const { type, on = true, params = {} } = options;
  patch.amp.on = on;
  patch.amp.type = type;
  Object.assign(patch.amp.params, BLOCK_DEFAULTS.amp, params);
};

interface DriveOptions {
  type: string;
  on?: boolean;
  params?: BlockParams;
}

const drive = (patch: Patch, options: DriveOptions): void => {
  const { type, on = true, params = {} } = options;
  patch.drive.on = on;
  patch.drive.type = type;
  Object.assign(patch.drive.params, BLOCK_DEFAULTS.drive, params);
};

/**
 * The FX param defaults for switching a slot to `fxType`: the device's own factory values, so any
 * field the caller doesn't set gets a real default instead of inheriting whatever stale raw byte the
 * slot was carrying, which for a GEQ band reads as -20 dB rather than the 0 dB it ships at. DELAY's
 * params depend on its sub-algorithm, so its defaults are that sub-algorithm's.
 */
const defaultFxParams = (fxType: string, subType: string | null = null): ParamDefaults => {
  if (fxType !== "DELAY") return { ...DEFAULTS_BY_TYPE.fx[fxType] };
  const subDefaults = subType === null ? undefined : DEFAULTS_BY_TYPE.fxDelay[subType];
  return { ...subDefaults };
};

interface FxOptions {
  slot: "fx1" | "fx2" | "fx3";
  type: string;
  subType?: string | null;
  params?: BlockParams;
  on?: boolean;
}

/**
 * The sub-model to build with: the caller's, or the one the device opens on. A type that has
 * sub-models is always set to one, so leaving it out has to mean the factory model rather than
 * whatever byte the slot happened to be carrying, which is a different model for OD/DS and leaves
 * DELAY with no param defaults at all.
 */
const selectedSubType = (block: "fx" | "pedalFx", type: string, subType: string | null): string | null => {
  if (subType !== null) return subType;
  const hasSubModels = block === "fx" ? PARAM_SUBTYPE_EFFECTS.has(type) : PFX_SUBTYPE_EFFECTS.has(type);
  if (!hasSubModels) return null;
  return DEFAULT_SUBTYPES[block]?.[type] ?? null;
};

const fx = (patch: Patch, options: FxOptions): void => {
  const { slot, type, subType = null, params = {}, on = true } = options;
  const selected = selectedSubType("fx", type, subType);
  const block = patch[slot];
  block.on = on;
  block.type = type;
  block.subType = selected;
  block.params = withDefaults(defaultFxParams(type, selected), params);
};

interface NoiseGateOptions {
  on?: boolean;
  params?: BlockParams;
}

const noiseGate = (patch: Patch, options: NoiseGateOptions): void => {
  const { on = true, params = {} } = options;
  patch.noiseGate.on = on;
  Object.assign(patch.noiseGate.params, BLOCK_DEFAULTS.noiseGate, params);
};

interface VolumeOptions {
  params?: BlockParams;
}

const volume = (patch: Patch, options: VolumeOptions): void => {
  Object.assign(patch.volume.params, BLOCK_DEFAULTS.volume, options.params);
};

interface PedalFxOptions {
  type: string;
  subType?: string;
  on?: boolean;
  params?: BlockParams;
}

/** Sets the expression pedal effect: WAH, whose `subType` picks the wah model, or PEDAL BEND. */
const pedalFx = (patch: Patch, options: PedalFxOptions): void => {
  const { type, subType, params = {}, on = true } = options;
  const block = patch.pedalFx;
  block.on = on;
  block.type = type;
  block.subType = selectedSubType("pedalFx", type, subType ?? null);
  block.params = withDefaults(DEFAULTS_BY_TYPE.pedalFx[type], params);
};

interface DelayOptions {
  type: string;
  on?: boolean;
  params?: BlockParams;
}

/**
 * Sets the delay block. Every control is optional because the types disagree about which they have:
 * TWIST has no TIME or FEEDBACK, GLITCH has no FEEDBACK or LEVEL, and WARP has no FEEDBACK or HIGH
 * CUT, so a caller building those types never has to invent values for controls they lack.
 */
const delay = (patch: Patch, options: DelayOptions): void => {
  const { type, on = true, params = {} } = options;
  patch.delay.on = on;
  patch.delay.type = type;
  patch.delay.params = withDefaults(DEFAULTS_BY_TYPE.delay[type], params);
};

interface ReverbOptions {
  type: string;
  on?: boolean;
  params?: BlockParams;
}

/** Sets the reverb block, on the same terms as `delay`: TERA ECHO has no TIME, SUB DELAY has no
 *  TONE, PRE-DELAY or DIRECT, and SHIMMER has no DENSITY or DIRECT. */
const reverb = (patch: Patch, options: ReverbOptions): void => {
  const { type, on = true, params = {} } = options;
  patch.reverb.on = on;
  patch.reverb.type = type;
  patch.reverb.params = withDefaults(DEFAULTS_BY_TYPE.reverb[type], params);
};

export {
  defaultFxParams,
  basePatch, amp, drive, fx, noiseGate, volume, pedalFx, delay, reverb,
};
export type {
  BasePatchOptions, AmpOptions, DriveOptions, FxOptions, NoiseGateOptions, VolumeOptions,
  PedalFxOptions, DelayOptions, ReverbOptions,
};
