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
import { BLOCK_GROUPS, BLOCK_NAMES, NESTED_PARAMS } from "../common";
import type { BlockName } from "../common";
import { basePatch, amp, odds, fx, ns, fv, pfx, delay, reverb, validateChain } from "../builder";
import type { AmpOptions, OddsOptions } from "../builder";
import type { CapabilityGroup } from "../../../types";
import type { Patch, FxParams } from "../types";
import { validateTypeParams, typeSurface } from "./validate";
import type { Issues } from "./validate";
import {
  asRecord, blockContext, misplacedLine, shapeSkeleton, unknownLine,
  PARAMS_FIELD, SUB_TYPE_FIELD, TYPE_FIELD,
} from "./errors";
import type { BlockContext } from "./errors";

const ON_FIELD = "on";

/** Patch-level fields that are not blocks. Every other key must name one. */
const PATCH_FIELDS = ["name", "chain", "key"];

/** The fields that select a block's shape rather than set one of its controls. */
const SELECTION_FIELDS = new Set<string>([TYPE_FIELD, SUB_TYPE_FIELD, ON_FIELD]);

/** The one block the device can't bypass, so it takes no `on`. */
const ALWAYS_ON = new Set<string>(["fv"]);

/** The one block every patch must set: the signal sounds through it and it has no off state. */
const REQUIRED_BLOCK = "amp";

/**
 * Blocks where `{ on: false }` on its own says what leaving the block out says, off at factory
 * defaults. The builder writes the same bytes for both, so the two are folded together here rather
 * than left as a second path that could drift from the first.
 */
const BYPASSABLE = new Set<string>(
  BLOCK_NAMES.filter(name => name !== REQUIRED_BLOCK && !ALWAYS_ON.has(name))
);

/** True when a block spec carries nothing but `on: false`. */
const isBareBypass = (value: unknown): boolean => {
  const entries = Object.entries(asRecord(value));
  return entries.length > 0 && entries.every(([key, entry]) => (key === ON_FIELD ? entry === false : entry === undefined));
};

/** The blocks a spec actually sets, with the ones written off folded into the ones left out. */
const setBlocks = (spec: Record<string, unknown>): BlockName[] =>
  BLOCK_NAMES.filter(name =>
    spec[name] !== undefined && !(BYPASSABLE.has(name) && isBareBypass(spec[name])));

/**
 * A block's controls, wherever it keeps them: an fx slot nests them in `params` the way the decoded
 * patch does, and every other block carries them flat, again as the decoded patch does.
 */
const blockControls = (name: BlockName, block: Record<string, unknown>): Record<string, unknown> => {
  if (NESTED_PARAMS.has(name)) return asRecord(block[PARAMS_FIELD]);
  return Object.fromEntries(Object.entries(block).filter(([key]) => !SELECTION_FIELDS.has(key)));
};

/** Every field name a block accepts: what selects its shape, then what sets its controls. */
const acceptedFields = (name: BlockName, context: BlockContext): string[] => {
  const capGroup = findGroup(gx1Capabilities, context.group);
  const selectors = capGroup.items.length > 0 ? [TYPE_FIELD, SUB_TYPE_FIELD] : [];
  const bypass = ALWAYS_ON.has(name) ? [] : [ON_FIELD];
  const controls = NESTED_PARAMS.has(name) ? [PARAMS_FIELD] : context.surface?.paramKeys ?? [];
  return [...selectors, ...bypass, ...controls];
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

const typeChoices = (capGroup: CapabilityGroup): string => capGroup.items.map(item => item.id).join(", ");

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

  issues.push(`${capGroup.id} has no type "${type}". Types: ${typeChoices(capGroup)}`);
  return false;
};

const checkBlock = (issues: Issues, name: BlockName, input: unknown): void => {
  const group = BLOCK_GROUPS[name];
  const capGroup = findGroup(gx1Capabilities, group);
  const block = asRecord(input);
  if (!checkType(issues, capGroup, block)) return;

  const context = blockContext(group, block);
  const selected = typeof block[SUB_TYPE_FIELD] === "string" ? block[SUB_TYPE_FIELD] : undefined;
  checkKeys(issues, block, { fields: acceptedFields(name, context), context });
  issues.push(...validateTypeParams({
    group,
    type: context.type,
    subType: selected,
    values: blockControls(name, block),
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
};

const checkBlockNames = (issues: Issues, spec: Record<string, unknown>): void => {
  const known = new Set<string>([...PATCH_FIELDS, ...BLOCK_NAMES]);
  const unknown = Object.keys(spec).filter(key => !known.has(key));
  if (unknown.length > 0) {
    const quoted = unknown.map(key => `"${key}"`).join(", ");
    issues.push(`${quoted} is not a block on this device. Blocks: ${BLOCK_NAMES.join(", ")}`);
  }
  if (spec[REQUIRED_BLOCK] === undefined) {
    issues.push(`Every patch needs an ${REQUIRED_BLOCK} block: it is what the signal sounds through.`);
  }
};

/** Every problem with a patch spec, empty when the spec is buildable. */
const validatePatchSpec = (input: unknown): Issues => {
  const spec = asRecord(input);
  const issues: Issues = [];
  checkName(issues, spec);
  checkBlockNames(issues, spec);
  for (const name of setBlocks(spec)) checkBlock(issues, name, spec[name]);
  return issues;
};

/**
 * Hands a validated block to its builder.
 *
 * The blocks with named options pass their spec straight through, since each was shaped to its
 * builder's options. AMP and OD/DS still need a cast for it: they require a `type`, which is
 * something `validatePatchSpec` has just established rather than something TypeScript can see, and
 * that gap is all the cast covers. The rest hand their controls over as one bag, which is how a
 * block whose fields follow from its `type` has always been built.
 */
const applyBlock = (patch: Patch, name: BlockName, block: Record<string, unknown>): void => {
  const type = block[TYPE_FIELD] as string;
  const on = block[ON_FIELD] as boolean | undefined;
  const subType = block[SUB_TYPE_FIELD] as string | undefined;
  const params = blockControls(name, block);

  switch (name) {
    case "amp": amp(patch, block as unknown as AmpOptions); return;
    case "odds": odds(patch, block as unknown as OddsOptions); return;
    case "ns": ns(patch, block); return;
    case "fv": fv(patch, block); return;
    case "pfx": pfx(patch, { type, subType, on, params }); return;
    case "delay": delay(patch, { type, on, params }); return;
    case "reverb": reverb(patch, { type, on, params }); return;
    // The three fx slots take the same spec and differ only in which slot it lands in.
    default: fx(patch, { slot: name, type, subType, on, params: params as FxParams }); return;
  }
};

/**
 * Builds one decoded patch from an unvalidated spec, rejecting the whole thing before any of it is
 * applied. Every block the spec leaves out stays off at the device's factory defaults.
 */
const buildPatch = (input: unknown): Patch => {
  const issues = validatePatchSpec(input);
  if (issues.length > 0) throw new Error(issues.join("\n"));

  const spec = asRecord(input);
  const chain = spec.chain === undefined ? undefined : validateChain(spec.chain as string[]);
  const patch = basePatch(spec.name as string, chain, spec.key as string | undefined);
  for (const name of setBlocks(spec)) applyBlock(patch, name, asRecord(spec[name]));
  return patch;
};

export { buildPatch, validatePatchSpec, blockControls, setBlocks };
export type { BlockName };
