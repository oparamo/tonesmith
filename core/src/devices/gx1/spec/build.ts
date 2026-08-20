/**
 * Checks a whole patch spec against the device's own capability catalog, before any of it reaches
 * the builder.
 *
 * The spec arrives as plain data from a caller that need not know the device, so every problem it
 * can have is a data problem: a block that isn't on this device, a type the block doesn't offer, a
 * control the chosen type has no field for, a value of the wrong kind or out of range. Reporting
 * them together matters as much as catching them, since a caller fixing one rejection at a time
 * pays a round trip per mistake and the catalog can answer for all of them in one pass.
 */
import { findGroup } from "../../../capability-utils";
import { gx1Capabilities } from "../capabilities";
import {
  BLOCK_GROUPS, BLOCK_NAMES, ON_FIELD, DEFAULT_CHAIN,
  LAST_NAMEABLE_CHAR, charsAbove,
} from "../common";
import type { BlockName } from "../common";
import { validateChain } from "../codec";
import { basePatch, amp, drive, fx, noiseGate, volume, pedalFx, delay, reverb } from "../builder";
import type { BasePatchOptions } from "../builder";
import type { CapabilityGroup } from "../../../types";
import type { Patch, BlockParams } from "../types";
import {
  checkSelectors, checkTypeBelongsInBlock, typeChoices, unknownTypeIssue, validateTypeParams,
  validatePatchSettings, typeSurface,
} from "./validate";
import type { Issues } from "./validate";
import {
  asRecord, blockContext, misplacedLine, shapeSkeleton, unknownLine, unknownParamLine,
  PARAMS_FIELD, SUB_TYPE_FIELD, TYPE_FIELD,
} from "./errors";
import type { BlockContext } from "./errors";

/** The patch's own settings, keyed as a spec writes them. Derived, so the catalog is the one list. */
const SETTING_KEYS = gx1Capabilities.patchSettings.flatMap(
  spec => (spec.key === undefined ? [] : [spec.key])
);

/** Patch-level fields that are not blocks. Every other key must name one. */
const PATCH_FIELDS = ["name", "memo", "chain", ...SETTING_KEYS];

/**
 * The one block the device can't bypass: the volume block has no on/off byte to write. Every other
 * block has one, so every other block can be left off. What a patch with a given block off would be
 * *for* is the player's call, not this validator's.
 */
const ALWAYS_ON = new Set<string>(["volume"]);

/** True when a block spec carries nothing but `on: false`. */
const isBareBypass = (value: unknown): boolean => {
  const entries = Object.entries(asRecord(value));
  return entries.length > 0 && entries.every(([key, entry]) => (key === ON_FIELD ? entry === false : entry === undefined));
};

/**
 * The blocks a spec actually sets, with the ones written off folded into the ones left out.
 * `{ on: false }` on its own says what leaving the block out says, off at factory defaults, and the
 * builder writes the same bytes for both, so folding them here keeps one path rather than a second
 * that could drift from it.
 */
const setBlocks = (spec: Record<string, unknown>): BlockName[] =>
  BLOCK_NAMES.filter(name =>
    spec[name] !== undefined && !(!ALWAYS_ON.has(name) && isBareBypass(spec[name])));

/** Every field name a block accepts: what selects its shape, then the one key its controls go under. */
const acceptedFields = (name: BlockName, context: BlockContext): string[] => {
  const capGroup = findGroup(gx1Capabilities, context.group);
  const selectors = capGroup.items.length > 0 ? [TYPE_FIELD, SUB_TYPE_FIELD] : [];
  const bypass = ALWAYS_ON.has(name) ? [] : [ON_FIELD];
  return [...selectors, ...bypass, PARAMS_FIELD];
};

/** One block's rejected keys, alongside the block they were sent to. */
interface KeyCheck {
  fields: string[];
  context: BlockContext;
}

/**
 * Splits the keys a block doesn't take into the two mistakes that produce them: a real param of the
 * chosen type sent one level too high, and a key the type has no param for at all. Either way the
 * accepted shape is printed back, since nesting is what a prose list of field names can't show and
 * nesting is what the caller got wrong.
 */
const checkKeys = (issues: Issues, block: Record<string, unknown>, check: KeyCheck): void => {
  const { fields, context } = check;
  const rejected = Object.keys(block).filter(key => !fields.includes(key));
  if (rejected.length === 0) return;

  const paramKeys = context.surface?.paramKeys ?? [];
  const misplaced = fields.includes(PARAMS_FIELD) ? rejected.filter(key => paramKeys.includes(key)) : [];
  const unknown = rejected.filter(key => !misplaced.includes(key));
  const misplacedText = misplaced.length > 0 ? [misplacedLine(misplaced, context)] : [];
  const unknownText = unknown.length > 0 ? [unknownLine(unknown)] : [];
  issues.push([...misplacedText, ...unknownText, shapeSkeleton(fields, context)].join("\n"));
};

/**
 * Rejects a control the chosen type has no field for, before the builder does. The builder throws on
 * the first one it meets, and reporting them here puts them alongside every other problem the spec
 * has rather than costing a round trip each.
 */
const checkParamKeys = (issues: Issues, params: Record<string, unknown>, context: BlockContext): void => {
  const paramKeys = context.surface?.paramKeys;
  if (paramKeys === undefined) return;
  const unknown = Object.keys(params).filter(key => !paramKeys.includes(key));
  if (unknown.length === 0) return;
  issues.push([unknownParamLine(unknown, context), shapeSkeleton([PARAMS_FIELD], context)].join("\n"));
};

/**
 * Rejects a block whose `type` names nothing the catalog knows, and reports whether it is usable.
 * Every later check reads the chosen type's own surface, so an unresolved one would leave the
 * caller's params reported as unknown keys with nothing saying the type was the problem.
 */
const checkType = (issues: Issues, capGroup: CapabilityGroup, block: Record<string, unknown>): boolean => {
  if (capGroup.items.length === 0) return true;

  const type = block[TYPE_FIELD];
  if (typeof type !== "string") {
    issues.push(`${capGroup.id} needs a ${TYPE_FIELD}. Types: ${typeChoices(capGroup)}`);
    return false;
  }
  if (typeSurface({ group: capGroup.id, type }) !== undefined) return true;

  issues.push(unknownTypeIssue(capGroup, type));
  return false;
};

const checkBlock = (issues: Issues, name: BlockName, input: unknown): void => {
  const group = BLOCK_GROUPS[name];
  const capGroup = findGroup(gx1Capabilities, group);
  const block = asRecord(input);
  if (!checkType(issues, capGroup, block)) return;
  checkTypeBelongsInBlock(issues, name, block[TYPE_FIELD]);

  const context = blockContext(group, block);
  const selected = typeof block[SUB_TYPE_FIELD] === "string" ? block[SUB_TYPE_FIELD] : undefined;
  checkSelectors(issues, { group, on: block[ON_FIELD], subType: block[SUB_TYPE_FIELD] });
  checkKeys(issues, block, { fields: acceptedFields(name, context), context });
  checkParamKeys(issues, asRecord(block[PARAMS_FIELD]), context);
  issues.push(...validateTypeParams({
    group,
    type: context.type,
    subType: selected,
    values: asRecord(block[PARAMS_FIELD]),
  }));
};

const checkName = (issues: Issues, spec: Record<string, unknown>): void => {
  const { maxLength } = gx1Capabilities.patchName;
  const name = spec.name;
  if (typeof name !== "string" || name.length === 0) {
    issues.push("Every patch needs a name.");
    return;
  }
  if (name.length > maxLength) {
    issues.push(`Patch name "${name}" is ${name.length} characters; this device stores ${maxLength}.`);
  }
  const unnameable = charsAbove(LAST_NAMEABLE_CHAR, name);
  if (unnameable.length > 0) {
    issues.push(`Patch name "${name}" uses characters this device cannot display: ${unnameable.join(" ")}`);
  }
};

/**
 * `chain` reaches the builder as an array it maps over, and `key` reaches the codec as a table
 * lookup, so an unchecked one surfaces as a TypeError or a codec throw at write time with nothing
 * naming the field that caused it.
 */
const checkChain = (issues: Issues, spec: Record<string, unknown>): void => {
  const chain = spec.chain;
  if (chain === undefined) return;
  if (!Array.isArray(chain) || chain.some(block => typeof block !== "string")) {
    issues.push(`chain lists every block in signal order. Blocks: ${DEFAULT_CHAIN.join(", ")}`);
    return;
  }
  try {
    validateChain(chain as string[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(message);
  }
};

/** The device's own note field, which a patch read back carries and so must be able to send back. */
const checkMemo = (issues: Issues, spec: Record<string, unknown>): void => {
  const memo = spec.memo;
  if (memo !== undefined && typeof memo !== "string") {
    issues.push(`Patch memo takes text (got ${JSON.stringify(memo)})`);
  }
};

const checkBlockNames = (issues: Issues, spec: Record<string, unknown>): void => {
  const known = new Set<string>([...PATCH_FIELDS, ...BLOCK_NAMES]);
  const unknown = Object.keys(spec).filter(key => !known.has(key));
  if (unknown.length > 0) {
    const quoted = unknown.map(key => `"${key}"`).join(", ");
    issues.push(`${quoted} is not a block on this device. Blocks: ${BLOCK_NAMES.join(", ")}`);
  }
};

/** Every problem with a patch spec, empty when the spec is buildable. */
const validatePatchSpec = (input: unknown): Issues => {
  const spec = asRecord(input);
  const issues: Issues = [];
  checkName(issues, spec);
  checkMemo(issues, spec);
  checkChain(issues, spec);
  issues.push(...validatePatchSettings(spec));
  checkBlockNames(issues, spec);
  for (const name of setBlocks(spec)) checkBlock(issues, name, spec[name]);
  return issues;
};

/**
 * Hands a validated block to its builder.
 *
 * Every block reaches this the same way, since every block takes the same shape: a `type` where the
 * device offers one, an optional `subType` and `on`, and one `params` bag. The `type` cast covers
 * only what `validatePatchSpec` has just established and TypeScript cannot see.
 */
const applyBlock = (patch: Patch, name: BlockName, block: Record<string, unknown>): void => {
  const type = block[TYPE_FIELD] as string;
  const on = block[ON_FIELD] as boolean | undefined;
  const subType = (block[SUB_TYPE_FIELD] ?? undefined) as string | undefined;
  const params = asRecord(block[PARAMS_FIELD]) as BlockParams;

  switch (name) {
    case "amp": amp(patch, { type, on, params }); return;
    case "drive": drive(patch, { type, on, params }); return;
    case "noiseGate": noiseGate(patch, { on, params }); return;
    case "volume": volume(patch, { params }); return;
    case "pedalFx": pedalFx(patch, { type, subType, on, params }); return;
    case "delay": delay(patch, { type, on, params }); return;
    case "reverb": reverb(patch, { type, on, params }); return;
    // The three fx slots take the same spec and differ only in which slot it lands in.
    default: fx(patch, { slot: name, type, subType, on, params }); return;
  }
};

/**
 * The chain and the patch settings a spec carries, ready for the builder. The return type is what
 * `validatePatchSpec` has just established of these values and TypeScript cannot see for itself. A
 * setting the spec leaves out stays absent, so the blank patch's own factory value survives.
 */
const basePatchOptions = (spec: Record<string, unknown>): BasePatchOptions => {
  const named = ["chain", ...SETTING_KEYS].filter(field => spec[field] !== undefined);
  return Object.fromEntries(named.map(field => [field, spec[field]]));
};

/**
 * Builds one decoded patch from an unvalidated spec, rejecting the whole thing before any of it is
 * applied. Every block the spec leaves out stays off at the device's factory defaults.
 */
const buildPatch = (input: unknown): Patch => {
  const issues = validatePatchSpec(input);
  if (issues.length > 0) throw new Error(issues.join("\n"));

  const spec = asRecord(input);
  const patch = basePatch(spec.name as string, basePatchOptions(spec));
  if (typeof spec.memo === "string") patch.memo = spec.memo;
  for (const name of setBlocks(spec)) applyBlock(patch, name, asRecord(spec[name]));
  return patch;
};

export { applyBlock, buildPatch, validatePatchSpec };
export type { BlockName };
