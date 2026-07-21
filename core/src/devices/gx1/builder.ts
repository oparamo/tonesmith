import type { Patch, FxParams, NsBlock, FvBlock } from "./types";
import { blankPatch, newFile, writeFile } from "./tsl";
import { PARAM_SUBTYPE_EFFECTS, NS_DETECT } from "./common";
import { DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS, FX_PARAM_MAPS, FX_DELAY_TYPE_MAPS, type FieldCodec } from "./codec";
import { DEFAULTS_BY_TYPE, type ParamDefaults } from "./defaults";

// The 10 reorderable blocks — OUTPUT is a fixed endpoint, not part of the chain array
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

/** Rejects unknown block names and duplicates; "OD" has already been aliased by the caller. */
const validateChainNames = (names: string[]): void => {
  const seen = new Set<string>();
  for (const name of names) {
    if (!DEFAULT_CHAIN.includes(name)) {
      throw new Error(`normalizeChain: unknown chain block "${name}" (valid: ${DEFAULT_CHAIN.join(", ")})`);
    }
    if (seen.has(name)) throw new Error(`normalizeChain: duplicate chain block "${name}"`);
    seen.add(name);
  }
};

/**
 * Expands a partial or reordered chain into the full 10-block chain, preserving
 * the caller's relative ordering. Blocks the caller omits are inserted immediately
 * after their DEFAULT_CHAIN predecessor (or at the front, for DEFAULT_CHAIN's first
 * block). Walking DEFAULT_CHAIN start to end guarantees that predecessor is already
 * in `result` by the time we look for it — either the caller included it, or an
 * earlier pass of this same loop just inserted it. "OD" is accepted as an alias
 * for "OD/DS".
 */
const normalizeChain = (partial: string[]): string[] => {
  const mapped = partial.map(name => (name === "OD" ? "OD/DS" : name));
  validateChainNames(mapped);

  const result = [...mapped];
  DEFAULT_CHAIN.forEach((block, defaultIndex) => {
    if (result.includes(block)) return;
    const insertAt = defaultIndex === 0 ? 0 : result.indexOf(DEFAULT_CHAIN[defaultIndex - 1]) + 1;
    result.splice(insertAt, 0, block);
  });
  return result;
};

const basePatch = (name: string, chain: string[] = DEFAULT_CHAIN, key = "C"): Patch => {
  const patch = blankPatch(name);
  patch.chain = chain;
  patch.key = key;
  return patch;
};

const amp = (
  patch: Patch,
  type: string,
  gain: number,
  bass: number,
  mid: number,
  treble: number,
  speaker = "ORIGINAL",
  mic = "DYN57",
  level = 100,
  solo = false,
  soloLevel = 50,
): void => {
  patch.amp.on = true;
  patch.amp.type = type;
  patch.amp.gain = gain;
  patch.amp.bass = bass;
  patch.amp.middle = mid;
  patch.amp.treble = treble;
  patch.amp.speaker = speaker;
  patch.amp.mic = mic;
  patch.amp.level = level;
  patch.amp.solo = solo;
  patch.amp.soloLevel = soloLevel;
};

const odds = (
  patch: Patch,
  type: string,
  drive: number,
  tone: number,
  level: number,
  direct = 0,
  solo = false,
  soloLevel = 50,
): void => {
  patch.odds.on = true;
  patch.odds.type = type;
  patch.odds.drive = drive;
  patch.odds.tone = tone;
  patch.odds.level = level;
  patch.odds.direct = direct;
  patch.odds.solo = solo;
  patch.odds.soloLevel = soloLevel;
};

const clearOdds = (patch: Patch): void => {
  patch.odds.on = false;
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
 * The FX param defaults for switching a slot to `fxType` — the device's own factory values from
 * DEFAULTS_BY_TYPE, so any field the caller doesn't set gets a real default instead of inheriting
 * whatever stale raw byte was in the slot before (the class of bug that left unset GEQ bands
 * decoding to −20 dB instead of 0 dB). DELAY is per-sub-algorithm (its defaults live under fxDelay).
 */
const defaultFxParams = (fxType: string, subType: string | null = null): Record<string, string | number> => {
  if (fxType === "DELAY") {
    const subDefaults = subType == null ? undefined : DEFAULTS_BY_TYPE.fxDelay[subType];
    return { ...(subDefaults ?? {}) };
  }
  return { ...(DEFAULTS_BY_TYPE.fx[fxType] ?? {}) };
};

/**
 * Rejects any key in a params bag that isn't valid. Shared by fx() and assignExtra. Two rejects:
 * a `named` key (one of the block's dedicated common-control fields — set it there, not in the
 * bag; enforces the "bag holds only the non-named params" rule), or a key that isn't a field of
 * the current type at all. `named` is empty for blocks with no dedicated fields (fx/pfx).
 */
const validateParamKeys = (
  keys: Iterable<string>,
  fields: FieldCodec[] | undefined,
  label: string,
  type: string,
  named: ReadonlySet<string> = new Set(),
): void => {
  const validNames = new Set((fields ?? []).map(field => field.name));
  for (const key of keys) {
    if (named.has(key)) {
      throw new Error(`${label} "${key}" is one of this block's common controls — set it via its own field, not the params bag`);
    }
    if (!validNames.has(key)) {
      const valid = [...validNames].join(", ");
      throw new Error(`${label} "${key}" is not valid for type "${type}" (valid keys: ${valid})`);
    }
  }
};

const fx = (
  patch: Patch,
  slot: "fx1" | "fx2" | "fx3",
  fxType: string,
  subType: string | null = null,
  params: FxParams = {},
): void => {
  const block = patch[slot];
  block.on = true;
  block.type = fxType;
  block.subType = subType;
  // For effects whose sub-model lives in param-block byte p[0] (not FX_COM byte[2]),
  // the encoder reads it from params.type, not block.subType — thread it through here
  // so callers can keep passing subType positionally without knowing that distinction.
  const merged =
    subType != null && PARAM_SUBTYPE_EFFECTS.has(fxType) && !("type" in params)
      ? { ...params, type: subType }
      : params;
  validateParamKeys(Object.keys(merged), fxFieldMap(fxType, subType), `${slot} param`, fxType);
  block.params = { ...defaultFxParams(fxType, subType), ...merged };
};

const ns = (patch: Patch, threshold: number, release: number, on = true, detect: string = NS_DETECT[0]): void => {
  patch.ns.on = on;
  patch.ns.threshold = threshold;
  patch.ns.release = release;
  patch.ns.detect = detect as NsBlock["detect"];
};

const fv = (patch: Patch, position: number, min: number, max: number, curve = "NORMAL"): void => {
  patch.fv.position = position;
  patch.fv.min = min;
  patch.fv.max = max;
  patch.fv.curve = curve as FvBlock["curve"];
};

/**
 * Merges the type-specific `params` bag into `target`, rejecting any key that isn't one of
 * `fields`' names (or that duplicates a `covered` common control) — a typo'd or type-mismatched
 * param would otherwise write a byte offset that's meaningless for the current type and silently
 * corrupt an unrelated field on encode. Shared by pfx/delay/reverb, whose field sets vary by type.
 *
 * Any field in `fields` that neither the caller (via `params`) nor the builder's own
 * positional params (named in `covered`) sets is filled from `defaults` (the type's real
 * factory values from DEFAULTS_BY_TYPE) — so type-specific fields (e.g. SHIMMER delay's
 * `pitch`, every PEDAL BEND/WAH field) can't inherit a stale raw byte left on `target` by
 * whatever type previously occupied the block. `covered` (rather than checking
 * `field.name in target`) is what makes this safe to call on a block object that's mutated
 * in place call after call: a field name shared between two types (e.g. WAH's and PEDAL
 * BEND's `level`) must still get re-defaulted on a type switch, even though the property
 * already exists on `target` from the prior type.
 */
const assignExtra = (
  target: Record<string, unknown>,
  params: Record<string, unknown>,
  fields: FieldCodec[] | undefined,
  blockLabel: string,
  type: string,
  covered: ReadonlySet<string>,
  defaults: ParamDefaults,
): void => {
  validateParamKeys(Object.keys(params), fields, `${blockLabel} param`, type, covered);
  for (const field of fields ?? []) {
    // `defaults` covers every field the codec map produces (it's harvested from the same maps and
    // locked to them by the defaults drift guard), so every non-covered field is present here.
    if (!covered.has(field.name) && !(field.name in params)) {
      target[field.name] = defaults[field.name];
    }
  }
  Object.assign(target, params);
};

/** Sets the expression pedal effect: "WAH" (wahType/level/direct/position/min/max) or "PEDAL BEND" (pitchMin/pitchMax/position/level/direct). */
const pfx = (patch: Patch, type: string, params: Record<string, unknown> = {}, on = true): void => {
  patch.pfx.on = on;
  patch.pfx.type = type;
  assignExtra(patch.pfx, params, PFX_TYPE_MAPS[type], "pfx", type, new Set(), DEFAULTS_BY_TYPE.pfx[type] ?? {});
};

const DELAY_COVERED_FIELDS = new Set(["time", "feedback", "level", "highCut"]);

const delay = (
  patch: Patch,
  type: string,
  time: number,
  feedback: number,
  level: number,
  highCut = "FLAT",
  on = true,
  params: Record<string, unknown> = {},
): void => {
  patch.delay.on = on;
  patch.delay.type = type;
  patch.delay.time = time;
  patch.delay.feedback = feedback;
  patch.delay.level = level;
  patch.delay.highCut = highCut;
  assignExtra(patch.delay, params, DELAY_TYPE_MAPS[type], "delay", type, DELAY_COVERED_FIELDS, DEFAULTS_BY_TYPE.delay[type]);
};

const REVERB_COVERED_FIELDS = new Set(["time", "level", "preDelay", "tone", "density", "direct"]);

const reverb = (
  patch: Patch,
  type: string,
  time: number,
  level: number,
  preDelay = 0,
  tone = 0,
  density = 5,
  direct = 100,
  on = true,
  params: Record<string, unknown> = {},
): void => {
  patch.reverb.on = on;
  patch.reverb.type = type;
  patch.reverb.time = time;
  patch.reverb.level = level;
  patch.reverb.preDelay = preDelay;
  patch.reverb.tone = tone;
  patch.reverb.density = density;
  patch.reverb.direct = direct;
  const fields = (STANDARD_REVERB_TYPES as readonly string[]).includes(type)
    ? REV_TYPE_MAPS.STANDARD
    : REV_TYPE_MAPS[type];
  assignExtra(patch.reverb, params, fields, "reverb", type, REVERB_COVERED_FIELDS, DEFAULTS_BY_TYPE.reverb[type]);
};

const saveTsl = (patches: Patch[], setName: string, outPath: string): void => {
  const file = newFile(setName, 0);
  file.patches = patches;
  writeFile(file, outPath);
  console.info(`Saved ${outPath} (${patches.length} patches)`);
};

export {
  DEFAULT_CHAIN, moveBefore, normalizeChain, defaultFxParams,
  basePatch, amp, odds, clearOdds, fx, ns, fv, pfx, delay, reverb, saveTsl,
};
