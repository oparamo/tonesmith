import type { Patch, FxParams, NsBlock, FvBlock } from "./types";
import { blankPatch, newFile, writeFile } from "./tsl";
import { PARAM_SUBTYPE_EFFECTS, NS_DETECT } from "./common";
import { DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS, FX_PARAM_MAPS, type FieldCodec } from "./codec";

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

// Real factory-default FX param values, anchored to core/tests/fixtures/gx1/default-init.tsl
// (the only captured source of truth for these). Only the types actually present in that
// fixture are overridden here — every other type falls back to the generic rule in
// defaultForField, since no other type's real factory default has been captured.
const FX_DEFAULT_OVERRIDES: Partial<Record<string, Record<string, string | number>>> = {
  "COMPRESSOR": { sustain: 50, attack: 50, level: 60 },
  "PARA. EQ":   { midFreq: "4kHz" },
  "CHORUS":     { rate: 50, depth: 40, level: 100, preDelay: 4, direct: 100 },
};

const LEVEL_FIELD = /level/i;

// The bypass/no-op value for tone-shaping lookup tables (e.g. FREQ_HIGH_CUT) isn't always
// table[0] — FREQ_HIGH_CUT lists it last. Preferring it over "first entry" whenever it's
// present keeps the generic rule from defaulting a highCut/lowCut-style field to an audible
// filter setting (e.g. "20Hz", a hard low-pass) just because of table ordering.
const NEUTRAL_LOOKUP_VALUE = "FLAT";

/**
 * Generic per-field default, used for any field FX_DEFAULT_OVERRIDES doesn't cover:
 * a signed (offset-encoded) field defaults to its centre (i.e. 0, "0 dB" for EQ gains);
 * a lookup field defaults to its table's bypass value if it has one, else its first entry;
 * a plain level-like field defaults to 50; anything else defaults to 0.
 */
const defaultForField = (field: FieldCodec): string | number => {
  if (field.kind === "lookup" || field.kind === "indexTable") {
    const table = field.table ?? [];
    if (table.length === 0) {
      throw new Error(`Field "${field.name}" has kind "${field.kind}" but no table entries`);
    }
    const value = table.includes(NEUTRAL_LOOKUP_VALUE) ? NEUTRAL_LOOKUP_VALUE : table[0];
    return value;
  }
  if (field.kind === "signed") return 0;
  if (LEVEL_FIELD.test(field.name)) return 50;
  return 0;
};

/**
 * Computes the full set of parameter defaults for switching an FX slot to `fxType`,
 * so any field the caller doesn't set gets a sane value instead of inheriting
 * whatever stale raw byte was in the slot before — the class of bug that left
 * unset GEQ bands decoding to −20 dB instead of 0 dB.
 */
const defaultFxParams = (fxType: string): Record<string, string | number> => {
  const fields = FX_PARAM_MAPS[fxType] ?? [];
  const overrides = FX_DEFAULT_OVERRIDES[fxType] ?? {};
  const defaults: Record<string, string | number> = {};
  for (const field of fields) {
    if (field.name === "type") continue;
    defaults[field.name] = overrides[field.name] ?? defaultForField(field);
  }
  return defaults;
};

/** Rejects any key in `params` that isn't one of `fields`' names. Shared by fx() and assignExtra. */
const validateParamKeys = (
  keys: Iterable<string>,
  fields: FieldCodec[] | undefined,
  label: string,
  type: string,
): void => {
  const validNames = new Set((fields ?? []).map(field => field.name));
  for (const key of keys) {
    if (!validNames.has(key)) {
      throw new Error(`${label} "${key}" is not valid for type "${type}"`);
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
  validateParamKeys(Object.keys(merged), FX_PARAM_MAPS[fxType], `${slot} param`, fxType);
  block.params = { ...defaultFxParams(fxType), ...merged };
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
 * Merges `extra` into `target`, rejecting any key that isn't one of `fields`'
 * names — a typo'd or type-mismatched extra param would otherwise write a byte
 * offset that's meaningless for the current type and silently corrupt an
 * unrelated field on encode. Shared by pfx/delay/reverb, whose field sets vary by type.
 *
 * Any field in `fields` that neither the caller (via `extra`) nor the builder's own
 * positional params (named in `covered`) sets is filled from `defaultForField` — the
 * same fix as `fx()`'s `defaultFxParams`, extended here so type-specific fields (e.g.
 * SHIMMER delay's `pitch`, every PEDAL BEND/WAH field) can't inherit a stale raw byte
 * left on `target` by whatever type previously occupied the block. `covered` (rather
 * than checking `field.name in target`) is what makes this safe to call on a block
 * object that's mutated in place call after call: a field name shared between two
 * types (e.g. WAH's and PEDAL BEND's `level`) must still get re-defaulted on a type
 * switch, even though the property already exists on `target` from the prior type.
 */
const assignExtra = (
  target: Record<string, unknown>,
  extra: Record<string, unknown>,
  fields: FieldCodec[] | undefined,
  blockLabel: string,
  type: string,
  covered: ReadonlySet<string> = new Set(),
): void => {
  validateParamKeys(Object.keys(extra), fields, `${blockLabel} extra param`, type);
  for (const field of fields ?? []) {
    if (!covered.has(field.name) && !(field.name in extra)) {
      target[field.name] = defaultForField(field);
    }
  }
  Object.assign(target, extra);
};

/** Sets the expression pedal effect: "WAH" (wahType/level/direct/position/min/max) or "PEDAL BEND" (pitchMin/pitchMax/position/level/direct). */
const pfx = (patch: Patch, type: string, params: Record<string, unknown> = {}, on = true): void => {
  patch.pfx.on = on;
  patch.pfx.type = type;
  assignExtra(patch.pfx, params, PFX_TYPE_MAPS[type], "pfx", type);
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
  extra: Record<string, unknown> = {},
): void => {
  patch.delay.on = on;
  patch.delay.type = type;
  patch.delay.time = time;
  patch.delay.feedback = feedback;
  patch.delay.level = level;
  patch.delay.highCut = highCut;
  assignExtra(patch.delay, extra, DELAY_TYPE_MAPS[type], "delay", type, DELAY_COVERED_FIELDS);
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
  extra: Record<string, unknown> = {},
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
  assignExtra(patch.reverb, extra, fields, "reverb", type, REVERB_COVERED_FIELDS);
};

const saveTsl = (patches: Patch[], setName: string, outPath: string): void => {
  const file = newFile(setName, 0);
  file.patches = patches;
  writeFile(file, outPath);
  console.info(`Saved ${outPath} (${patches.length} patches)`);
};

// defaultForField is exported for direct unit testing of its per-kind default rules
// (including the invariant guard on malformed lookup/indexTable fields) — it's not part
// of the public gx1 API surface (not re-exported from devices/gx1/index.ts).
export {
  DEFAULT_CHAIN, moveBefore, normalizeChain, defaultFxParams, defaultForField,
  basePatch, amp, odds, clearOdds, fx, ns, fv, pfx, delay, reverb, saveTsl,
};
