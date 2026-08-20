import type { Patch, BlockParams, PatchSettings } from "./types";
import { blankPatch } from "./tsl";
import {
  PARAM_SUBTYPE_EFFECTS, PFX_SUBTYPE_EFFECTS, SUB_TYPE_FIELD, DEFAULT_CHAIN, onlyBlockFor,
} from "./common";
import {
  DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS, FX_PARAM_MAPS,
  FX_DELAY_TYPE_MAPS, validateChain, type FieldCodec,
} from "./codec";
import { DEFAULTS_BY_TYPE, BLOCK_DEFAULTS, DEFAULT_SUBTYPES, type ParamDefaults } from "./defaults";

/** Returns a new chain array with `node` relocated to sit immediately before `beforeNode`. */
const moveBefore = (chain: string[], node: string, beforeNode: string): string[] => {
  const without = chain.filter(n => n !== node);
  const index = without.indexOf(beforeNode);
  if (index < 0) throw new Error(`moveBefore: ${beforeNode} not found in chain`);
  return [...without.slice(0, index), node, ...without.slice(index)];
};

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
  const chain = options.chain ?? DEFAULT_CHAIN;
  // The same check `encodeChain` runs at the byte boundary, called here so a bad order is rejected
  // while the caller still has the spec in hand rather than several blocks later.
  validateChain(chain);
  patch.chain = chain;
  patch.memoryLevel = options.memoryLevel ?? patch.memoryLevel;
  patch.bpm = options.bpm ?? patch.bpm;
  patch.key = options.key ?? patch.key;
  patch.carryover = options.carryover ?? patch.carryover;
  patch.tempoHold = options.tempoHold ?? patch.tempoHold;
  return patch;
};

/**
 * Applies one single-shape block's params, giving every control the caller left unset the device's
 * own factory value. Assigning the defaults first rather than only where the block is missing a
 * property is what makes this safe on a patch built up call after call: the block already carries a
 * value for every control, so "unset" has to mean "what the caller supplied", not "what isn't there
 * yet". These blocks have no field map to check names against, so the factory defaults stand in:
 * they cover every control the block has and nothing else.
 */
const applyBlockParams = (target: BlockParams, block: string, params: BlockParams): void => {
  const defaults = BLOCK_DEFAULTS[block] ?? {};
  const valid = new Set(Object.keys(defaults));
  for (const key of Object.keys(params)) {
    if (!valid.has(key)) {
      throw new Error(`${block} param "${key}" is not one of its controls (valid keys: ${[...valid].join(", ")})`);
    }
  }
  Object.assign(target, defaults, params);
};

interface AmpOptions {
  type: string;
  on?: boolean;
  params?: BlockParams;
}

const amp = (patch: Patch, options: AmpOptions): void => {
  const { type, on = true, params = {} } = options;
  patch.amp.on = on;
  patch.amp.type = type;
  applyBlockParams(patch.amp.params, "amp", params);
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
  applyBlockParams(patch.drive.params, "drive", params);
};

/**
 * Resolve an FX type's field map. DELAY is per-sub-algorithm (its fields depend on `subType`);
 * every other FX type has one flat map. Returns undefined when the map isn't known.
 */
const fxFieldMap = (fxType: string, subType: string | null): FieldCodec[] | undefined => {
  if (fxType !== "DELAY") return FX_PARAM_MAPS[fxType];
  if (subType == null) return undefined;
  return FX_DELAY_TYPE_MAPS[subType];
};

/**
 * The FX param defaults for switching a slot to `fxType`: the device's own factory values from
 * DEFAULTS_BY_TYPE, so any field the caller doesn't set gets a real default instead of inheriting
 * whatever stale raw byte the slot was carrying, which for a GEQ band reads as -20 dB rather than
 * the 0 dB it ships at. DELAY is per-sub-algorithm (its defaults live under fxDelay).
 */
const defaultFxParams = (fxType: string, subType: string | null = null): Record<string, string | number | boolean> => {
  if (fxType === "DELAY") {
    const subDefaults = subType == null ? undefined : DEFAULTS_BY_TYPE.fxDelay[subType];
    return { ...(subDefaults ?? {}) };
  }
  return { ...(DEFAULTS_BY_TYPE.fx[fxType] ?? {}) };
};

/**
 * The field set a block's params are checked against: `fields` are the codec fields of the block's
 * current `type`, and `label` prefixes the error a bad key raises. Every block funnels its named
 * controls and its `params` record through one bag, so this is the only list either is judged by.
 */
interface ParamKeySpec {
  label: string;
  type: string;
  fields: FieldCodec[] | undefined;
}

/**
 * Rejects any key that isn't a field of the current type. Without this a typo'd or type-mismatched
 * param writes a byte offset that means something else for this type, and silently corrupts an
 * unrelated field on encode. It is also what stops a named control the type has no field for, such
 * as a TIME on TWIST, from being accepted and then dropped.
 */
const validateParamKeys = (keys: Iterable<string>, spec: ParamKeySpec): void => {
  const validNames = new Set((spec.fields ?? []).map(field => field.name));
  for (const key of keys) {
    if (!validNames.has(key)) {
      const valid = [...validNames].join(", ");
      throw new Error(`${spec.label} param "${key}" is not valid for type "${spec.type}" (valid keys: ${valid})`);
    }
  }
};

/** A ParamKeySpec plus the sub-model selection to fold into the block's params bag. */
interface SubTypeSpec extends ParamKeySpec {
  subType?: string | null;
  /** The params key that carries the selection, absent when the type has no sub-model. */
  field?: string;
}

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
  if (subType != null) return subType;
  const hasSubModels = block === "fx" ? PARAM_SUBTYPE_EFFECTS.has(type) : PFX_SUBTYPE_EFFECTS.has(type);
  if (!hasSubModels) return null;
  const defaults = block === "fx" ? DEFAULT_SUBTYPES.fx : DEFAULT_SUBTYPES.pedalFx;
  return defaults?.[type] ?? null;
};

/**
 * Rejects a sub-model a block cannot store, before it silently does nothing. A type with no
 * sub-model rejects the value rather than dropping it: nothing downstream would encode it, so the
 * patch saves without complaint and plays as the default, which is the one failure a caller cannot
 * see. Naming the selector among the params is rejected on the same terms: a decoded block carries
 * the selection once, under `subType`, and that is the only copy the codec writes from.
 */
const checkSubType = (params: BlockParams, spec: SubTypeSpec): void => {
  const { label, type, subType, field } = spec;
  if (field !== undefined) {
    if (!(field in params)) return;
    throw new Error(`${label} sub-model for type "${type}" is set as params.${field}; set it as subType instead`);
  }
  if (subType == null) return;
  const valid = (spec.fields ?? []).map(codecField => codecField.name).join(", ");
  throw new Error(
    `${label} type "${type}" has no subType (got "${subType}"); if that names one of this ` +
    `type's params, pass it in params instead (valid keys: ${valid})`
  );
};

const fx = (patch: Patch, options: FxOptions): void => {
  const { slot, type, subType = null, params = {}, on = true } = options;
  const onlySlot = onlyBlockFor(type);
  if (onlySlot !== undefined && onlySlot !== slot) {
    throw new Error(`${type} is a ${onlySlot} effect; this device has nowhere to store it in ${slot}.`);
  }
  const selected = selectedSubType("fx", type, subType);
  const block = patch[slot];
  block.on = on;
  block.type = type;
  block.subType = selected;
  const keySpec: ParamKeySpec = { label: slot, type, fields: fxFieldMap(type, selected) };
  const field = PARAM_SUBTYPE_EFFECTS.has(type) ? SUB_TYPE_FIELD : undefined;
  checkSubType(params, { ...keySpec, subType: selected, field });
  validateParamKeys(Object.keys(params), keySpec);
  block.params = { ...defaultFxParams(type, selected), ...params };
};

interface NoiseGateOptions {
  on?: boolean;
  params?: BlockParams;
}

const noiseGate = (patch: Patch, options: NoiseGateOptions): void => {
  const { on = true, params = {} } = options;
  patch.noiseGate.on = on;
  applyBlockParams(patch.noiseGate.params, "noiseGate", params);
};

interface VolumeOptions {
  params?: BlockParams;
}

const volume = (patch: Patch, options: VolumeOptions): void => {
  applyBlockParams(patch.volume.params, "volume", options.params ?? {});
};

/** A ParamKeySpec plus the type's factory values, everything needed to fill a block's params bag. */
interface BlockTypeSpec extends ParamKeySpec {
  defaults: ParamDefaults;
}

/**
 * The params to store for a block's current type: every field of that type at its real factory
 * value, with what the caller supplied over the top.
 *
 * Built fresh rather than merged into what the block already holds, so switching a block's type
 * leaves none of the previous type's fields behind. That matters because the types of one block
 * share a byte range: a stale `pitch` left over from SHIMMER means nothing to SUB DELAY, and the
 * decoded patch would show a control the chosen type does not have.
 *
 * `defaults` covers every field the codec map produces; it is harvested from the same maps and
 * locked to them by the defaults drift guard.
 */
const typedParams = (params: BlockParams, spec: BlockTypeSpec): BlockParams => {
  validateParamKeys(Object.keys(params), spec);
  const factory: BlockParams = {};
  for (const field of spec.fields ?? []) {
    const value = spec.defaults[field.name];
    if (value !== undefined) factory[field.name] = value;
  }
  return { ...factory, ...params };
};

interface PedalFxOptions {
  type: string;
  subType?: string;
  on?: boolean;
  params?: BlockParams;
}

/** Sets the expression pedal effect: "WAH" (subType picks the wah model, plus
 *  level/direct/position/min/max) or "PEDAL BEND" (pitchMin/pitchMax/position/level/direct). */
const pedalFx = (patch: Patch, options: PedalFxOptions): void => {
  const { type, subType, params = {}, on = true } = options;
  const block = patch.pedalFx;
  block.on = on;
  block.type = type;
  const selected = selectedSubType("pedalFx", type, subType ?? null);
  block.subType = selected;
  const typeSpec: BlockTypeSpec = {
    label: "pedalFx",
    type,
    fields: PFX_TYPE_MAPS[type],
    defaults: DEFAULTS_BY_TYPE.pedalFx[type] ?? {},
  };
  const field = PFX_SUBTYPE_EFFECTS.has(type) ? SUB_TYPE_FIELD : undefined;
  checkSubType(params, { ...typeSpec, subType: selected, field });
  block.params = typedParams(params, typeSpec);
};

interface DelayOptions {
  type: string;
  on?: boolean;
  params?: BlockParams;
}

/**
 * Sets the delay block. Every control is optional because the types disagree about which they have:
 * TWIST has no TIME or FEEDBACK, GLITCH has no FEEDBACK or LEVEL, and WARP has no FEEDBACK or HIGH
 * CUT. Requiring every control would force a caller building those types to invent values the
 * encoder silently drops, so a control the chosen type has no field for is rejected by name instead.
 */
const delay = (patch: Patch, options: DelayOptions): void => {
  const { type, on = true, params = {} } = options;
  const block = patch.delay;
  block.on = on;
  block.type = type;
  const typeSpec: BlockTypeSpec = {
    label: "delay",
    type,
    fields: DELAY_TYPE_MAPS[type],
    defaults: DEFAULTS_BY_TYPE.delay[type] ?? {},
  };
  block.params = typedParams(params, typeSpec);
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
  const block = patch.reverb;
  block.on = on;
  block.type = type;
  const fields = (STANDARD_REVERB_TYPES as readonly string[]).includes(type)
    ? REV_TYPE_MAPS.STANDARD
    : REV_TYPE_MAPS[type];
  const typeSpec: BlockTypeSpec = {
    label: "reverb",
    type,
    fields,
    defaults: DEFAULTS_BY_TYPE.reverb[type] ?? {},
  };
  block.params = typedParams(params, typeSpec);
};

export {
  moveBefore, defaultFxParams,
  basePatch, amp, drive, fx, noiseGate, volume, pedalFx, delay, reverb,
};
export type {
  BasePatchOptions, AmpOptions, DriveOptions, FxOptions, NoiseGateOptions, VolumeOptions,
  PedalFxOptions, DelayOptions, ReverbOptions,
};
