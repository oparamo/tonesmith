/**
 * Assembles a patch from input `spec/` has already validated against the capability catalog, the
 * only way anything reaches these functions. They check nothing again: the drift guards hold the
 * catalog and the codec field maps equal, so a key the catalog accepted is a field the codec writes.
 * What they add is the device's own factory value for every control the caller left out.
 */
import type { Patch, BlockParams, PatchSettings } from "../model";
import { blankPatch } from "../format/tsl";
import { PARAM_SUBTYPE_EFFECTS, PFX_SUBTYPE_EFFECTS, DEFAULT_CHAIN } from "../model";
import type { BlockName } from "../model";
import { DEFAULTS_BY_TYPE, BLOCK_DEFAULTS, DEFAULT_SUBTYPES } from "../catalog/defaults";
import type { ParamDefaults } from "../catalog/defaults";

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

/** What a spec sets on one block. Which of these a block reads depends on what the block has. */
interface BlockOptions {
  type?: string;
  subType?: string | null;
  on?: boolean;
  params?: BlockParams;
}

/** Blocks with one set of controls whatever they are set to. */
type SingleShapeBlock = "amp" | "drive" | "noiseGate" | "volume";

/** Blocks whose controls are the chosen type's own. */
type PerTypeBlock = Exclude<BlockName, SingleShapeBlock>;

const SINGLE_SHAPE_BLOCKS: ReadonlySet<BlockName> = new Set<SingleShapeBlock>(["amp", "drive", "noiseGate", "volume"]);

const isSingleShape = (name: BlockName): name is SingleShapeBlock => SINGLE_SHAPE_BLOCKS.has(name);

/**
 * A single-shape block assigns into the params it already holds, since those carry every control
 * the block has whatever it is set to, and every one of them is overwritten here. The amp and the
 * drive select a type; the noise gate has no type, and the foot volume has no bypass either.
 */
const singleShapeBlock = (patch: Patch, name: SingleShapeBlock, options: BlockOptions): void => {
  const block = patch[name];
  Object.assign(block.params, BLOCK_DEFAULTS[name], options.params);
  if ("on" in block) block.on = options.on ?? true;
  if ("type" in block && options.type !== undefined) block.type = options.type;
};

/**
 * The sub-model to build with: the caller's, or the one the device opens on. A type that has
 * sub-models is always set to one, so leaving it out has to mean the factory model rather than
 * whatever byte the slot happened to be carrying, which is a different model for OD/DS and leaves
 * DELAY with no param defaults at all.
 */
const selectedSubType = (group: "fx" | "pedalFx", type: string, subType: string | null): string | null => {
  if (subType !== null) return subType;
  const hasSubModels = group === "fx" ? PARAM_SUBTYPE_EFFECTS.has(type) : PFX_SUBTYPE_EFFECTS.has(type);
  if (!hasSubModels) return null;
  return DEFAULT_SUBTYPES[group]?.[type] ?? null;
};

/** The factory values a per-type block starts from for this selection. */
const perTypeDefaults = (name: PerTypeBlock, type: string, subType: string | null): ParamDefaults | undefined => {
  if (name === "delay" || name === "reverb" || name === "pedalFx") return DEFAULTS_BY_TYPE[name][type];
  return defaultFxParams(type, subType);
};

/** The sub-model a per-type block ends up on, or null for a block that has none to select. */
const subTypeFor = (name: PerTypeBlock, type: string, requested: string | null): string | null => {
  if (name === "delay" || name === "reverb") return null;
  const group = name === "pedalFx" ? "pedalFx" : "fx";
  return selectedSubType(group, type, requested);
};

/**
 * Every control of a per-type block is optional, because the types disagree about which they have:
 * delay's TWIST has no TIME or FEEDBACK, reverb's TERA ECHO has no TIME, so a caller never has to
 * invent values for controls a type lacks.
 */
const perTypeBlock = (patch: Patch, name: PerTypeBlock, options: BlockOptions): void => {
  const block = patch[name];
  const type = options.type ?? block.type;
  const subType = subTypeFor(name, type, options.subType ?? null);
  block.on = options.on ?? true;
  block.type = type;
  if ("subType" in block) block.subType = subType;
  block.params = withDefaults(perTypeDefaults(name, type, subType), options.params ?? {});
};

/** Sets one block from a validated spec, filling every control the spec leaves out with its factory value. */
const block = (patch: Patch, name: BlockName, options: BlockOptions): void => {
  if (isSingleShape(name)) singleShapeBlock(patch, name, options);
  else perTypeBlock(patch, name, options);
};

export { defaultFxParams, basePatch, block };
export type { BasePatchOptions, BlockOptions };
