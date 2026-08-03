import type { Patch, FxParams, NsBlock, FvBlock } from "./types";
import { blankPatch, newFile, writeFile } from "./tsl";
import { PARAM_SUBTYPE_EFFECTS, NS_DETECT } from "./common";
import { DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS, FX_PARAM_MAPS, FX_DELAY_TYPE_MAPS, type FieldCodec } from "./codec";
import { DEFAULTS_BY_TYPE, type ParamDefaults } from "./defaults";

// The 10 reorderable blocks. OUTPUT is a fixed endpoint, not part of the chain array
// (see CHAIN_BLOCK_ORDER in common/constants.ts for the underlying byte encoding).
const DEFAULT_CHAIN: string[] =
  ["PFX", "FX1", "OD/DS", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"];

/** Returns a new chain array with `node` relocated to sit immediately before `beforeNode`. */
const moveBefore = (chain: string[], node: string, beforeNode: string): string[] => {
  const without = chain.filter(n => n !== node);
  const index = without.indexOf(beforeNode);
  if (index < 0) throw new Error(`moveBefore: ${beforeNode} not found in chain`);
  return [...without.slice(0, index), node, ...without.slice(index)];
};

/**
 * Rejects anything but a complete block order: every DEFAULT_CHAIN block exactly once, listed
 * first-to-last. A partial list has no safe reading, since where its missing blocks belong is a
 * guess, and encodeChain demands all of them anyway. Returns the chain with "OD" resolved to
 * "OD/DS", the one alias callers may use, which is why it hands back an array rather than
 * checking in place.
 */
const validateChain = (chain: string[]): string[] => {
  const resolved = chain.map(name => (name === "OD" ? "OD/DS" : name));

  const seen = new Set<string>();
  for (const name of resolved) {
    if (!DEFAULT_CHAIN.includes(name)) {
      throw new Error(`validateChain: unknown chain block "${name}" (valid: ${DEFAULT_CHAIN.join(", ")})`);
    }
    if (seen.has(name)) throw new Error(`validateChain: duplicate chain block "${name}"`);
    seen.add(name);
  }

  const missing = DEFAULT_CHAIN.filter(block => !seen.has(block));
  if (missing.length > 0) {
    throw new Error(
      `validateChain: the chain must list every block exactly once; missing ${missing.join(", ")} ` +
      `(default order: ${DEFAULT_CHAIN.join(", ")})`
    );
  }
  return resolved;
};

const basePatch = (name: string, chain: string[] = DEFAULT_CHAIN, key = "C"): Patch => {
  const patch = blankPatch(name);
  patch.chain = chain;
  patch.key = key;
  return patch;
};

interface AmpOptions {
  type: string;
  gain: number;
  bass: number;
  middle: number;
  treble: number;
  speaker?: string;
  mic?: string;
  level?: number;
  solo?: boolean;
  soloLevel?: number;
  on?: boolean;
}

const amp = (patch: Patch, options: AmpOptions): void => {
  const { speaker = "ORIGINAL", mic = "DYN57", level = 100, solo = false, soloLevel = 50, on = true } = options;
  const block = patch.amp;
  block.on = on;
  block.type = options.type;
  block.gain = options.gain;
  block.bass = options.bass;
  block.middle = options.middle;
  block.treble = options.treble;
  block.speaker = speaker;
  block.mic = mic;
  block.level = level;
  block.solo = solo;
  block.soloLevel = soloLevel;
};

interface OddsOptions {
  type: string;
  drive: number;
  tone: number;
  level: number;
  direct?: number;
  solo?: boolean;
  soloLevel?: number;
  on?: boolean;
}

const odds = (patch: Patch, options: OddsOptions): void => {
  const { direct = 0, solo = false, soloLevel = 50, on = true } = options;
  const block = patch.odds;
  block.on = on;
  block.type = options.type;
  block.drive = options.drive;
  block.tone = options.tone;
  block.level = options.level;
  block.direct = direct;
  block.solo = solo;
  block.soloLevel = soloLevel;
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
 * whatever stale raw byte was in the slot before (the class of bug that left unset GEQ bands
 * decoding to -20 dB instead of 0 dB). DELAY is per-sub-algorithm (its defaults live under fxDelay).
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

interface FxOptions {
  slot: "fx1" | "fx2" | "fx3";
  type: string;
  subType?: string | null;
  params?: FxParams;
  on?: boolean;
}

const fx = (patch: Patch, options: FxOptions): void => {
  const { slot, type, subType = null, params = {}, on = true } = options;
  const block = patch[slot];
  block.on = on;
  block.type = type;
  block.subType = subType;
  // For effects whose sub-model lives in param-block byte p[0] (not FX_COM byte[2]),
  // the encoder reads it from params.type, not block.subType. Threading it through here
  // lets callers set subType the same way for every effect.
  const merged =
    subType != null && PARAM_SUBTYPE_EFFECTS.has(type) && !("type" in params)
      ? { ...params, type: subType }
      : params;
  const keySpec: ParamKeySpec = { label: slot, type, fields: fxFieldMap(type, subType) };
  validateParamKeys(Object.keys(merged), keySpec);
  block.params = { ...defaultFxParams(type, subType), ...merged };
};

interface NsOptions {
  threshold: number;
  release: number;
  on?: boolean;
  detect?: string;
}

const ns = (patch: Patch, options: NsOptions): void => {
  const { on = true, detect = NS_DETECT[0] } = options;
  const block = patch.ns;
  block.on = on;
  block.threshold = options.threshold;
  block.release = options.release;
  block.detect = detect as NsBlock["detect"];
};

interface FvOptions {
  position: number;
  min: number;
  max: number;
  curve?: string;
}

const fv = (patch: Patch, options: FvOptions): void => {
  const { curve = "NORMAL" } = options;
  const block = patch.fv;
  block.position = options.position;
  block.min = options.min;
  block.max = options.max;
  block.curve = curve as FvBlock["curve"];
};

/** A ParamKeySpec plus the type's factory values, everything needed to fill a block's params bag. */
interface BlockTypeSpec extends ParamKeySpec {
  defaults: ParamDefaults;
}

/**
 * Gives every field of the current type that nobody set its real factory value, so a type-specific
 * field (SHIMMER delay's `pitch`, every PEDAL BEND field) can't inherit a stale raw byte left in the
 * block by whatever type occupied it before. Asking what the caller supplied rather than what the
 * block already carries is what makes that safe on a block mutated in place call after call: a field
 * name two types share, such as WAH's and PEDAL BEND's `level`, must still be re-defaulted on a type
 * switch even though the property is already there from the prior type.
 *
 * `defaults` covers every field the codec map produces; it is harvested from the same maps and
 * locked to them by the defaults drift guard.
 */
const applyTypeDefaults = (
  target: Record<string, unknown>,
  params: Record<string, unknown>,
  spec: BlockTypeSpec,
): void => {
  for (const field of spec.fields ?? []) {
    if (!(field.name in params)) {
      target[field.name] = spec.defaults[field.name];
    }
  }
};

/** Validates a block's params bag against its current type, fills that type's defaults, then merges the bag in. */
const assignExtra = (
  target: Record<string, unknown>,
  params: Record<string, unknown>,
  spec: BlockTypeSpec,
): void => {
  validateParamKeys(Object.keys(params), spec);
  applyTypeDefaults(target, params, spec);
  Object.assign(target, params);
};

interface PfxOptions {
  type: string;
  params?: Record<string, unknown>;
  on?: boolean;
}

/** Sets the expression pedal effect: "WAH" (wahType/level/direct/position/min/max) or "PEDAL BEND" (pitchMin/pitchMax/position/level/direct). */
const pfx = (patch: Patch, options: PfxOptions): void => {
  const { type, params = {}, on = true } = options;
  patch.pfx.on = on;
  patch.pfx.type = type;
  const typeSpec: BlockTypeSpec = {
    label: "pfx",
    type,
    fields: PFX_TYPE_MAPS[type],
    defaults: DEFAULTS_BY_TYPE.pfx[type] ?? {},
  };
  assignExtra(patch.pfx, params, typeSpec);
};

/**
 * One params bag from a block's named controls and its `params` record.
 *
 * Unset named controls are dropped so an omitted one takes its type's factory default, the rule the
 * bag already follows, rather than being written as `undefined`. A control given both ways is
 * rejected instead of resolved: quietly keeping one of two conflicting values is the same failure
 * this path exists to prevent.
 */
const mergeBlockParams = (named: object, params: Record<string, unknown>, label: string): Record<string, unknown> => {
  const supplied = Object.fromEntries(Object.entries(named).filter(([, value]) => value !== undefined));
  for (const key of Object.keys(supplied)) {
    if (key in params) {
      throw new Error(`${label} param "${key}" is set both as a named control and in the params bag; set it once`);
    }
  }
  return { ...supplied, ...params };
};

interface DelayOptions {
  type: string;
  time?: number;
  feedback?: number;
  level?: number;
  highCut?: string;
  on?: boolean;
  params?: Record<string, unknown>;
}

/**
 * Sets the delay block. Every control is optional because the types disagree about which they have:
 * TWIST has no TIME or FEEDBACK, GLITCH has no FEEDBACK or LEVEL, and WARP has no FEEDBACK or HIGH
 * CUT. Requiring them forced a caller building those types to invent values that encode then
 * dropped, so a control the chosen type has no field for is now rejected by name.
 */
const delay = (patch: Patch, options: DelayOptions): void => {
  const { type, on = true, params = {}, ...named } = options;
  const block = patch.delay;
  block.on = on;
  block.type = type;
  const typeSpec: BlockTypeSpec = {
    label: "delay",
    type,
    fields: DELAY_TYPE_MAPS[type],
    defaults: DEFAULTS_BY_TYPE.delay[type],
  };
  assignExtra(block, mergeBlockParams(named, params, typeSpec.label), typeSpec);
};

interface ReverbOptions {
  type: string;
  time?: number;
  level?: number;
  preDelay?: number;
  tone?: number;
  density?: number;
  direct?: number;
  on?: boolean;
  params?: Record<string, unknown>;
}

/** Sets the reverb block, on the same terms as `delay`: TERA ECHO has no TIME, SUB DELAY has no
 *  TONE, PRE-DELAY or DIRECT, and SHIMMER has no DENSITY or DIRECT. */
const reverb = (patch: Patch, options: ReverbOptions): void => {
  const { type, on = true, params = {}, ...named } = options;
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
    defaults: DEFAULTS_BY_TYPE.reverb[type],
  };
  assignExtra(block, mergeBlockParams(named, params, typeSpec.label), typeSpec);
};

const saveTsl = (patches: Patch[], setName: string, outPath: string): void => {
  const file = newFile(setName, 0);
  file.patches = patches;
  writeFile(file, outPath);
  console.info(`Saved ${outPath} (${patches.length} patches)`);
};

export {
  DEFAULT_CHAIN, moveBefore, validateChain, defaultFxParams,
  basePatch, amp, odds, fx, ns, fv, pfx, delay, reverb, saveTsl,
};
export type {
  AmpOptions, OddsOptions, FxOptions, NsOptions, FvOptions, PfxOptions, DelayOptions, ReverbOptions,
};
