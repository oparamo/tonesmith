/**
 * The GX-1's own checks on a patch spec, beside the catalog checks every device shares: the
 * characters its display can show in a name, the order its chain may take, and the keys a spec may
 * carry. Then the spec is built, every block the spec leaves out staying off at factory settings.
 */
import { validateSpec, setBlocks, asRecord } from "../../../service/specService";
import type { Issues } from "../../../service/specService";
import { messageOf } from "../../../common/error";
import { gx1Capabilities } from "../catalog/capabilities";
import {
  BLOCK_NAMES, ON_FIELD, PARAMS_FIELD, SUB_TYPE_FIELD, TYPE_FIELD, DEFAULT_CHAIN,
  LAST_NAMEABLE_CHAR, charsAbove,
} from "../model";
import type { BlockName } from "../model";
import { validateChain } from "../format/codec";
import { basePatch, block } from "./builder";
import type { BasePatchOptions } from "./builder";
import type { Patch, BlockParams } from "../model";

/** The patch's own settings, keyed as a spec writes them. Derived, so the catalog is the one list. */
const SETTING_KEYS = gx1Capabilities.patchSettings.flatMap(
  spec => (spec.key === undefined ? [] : [spec.key])
);

/** Patch-level fields that are not blocks. Every other key must name one. */
const PATCH_FIELDS = ["name", "memo", "chain", ...SETTING_KEYS];

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
    issues.push(messageOf(error));
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
  checkBlockNames(issues, spec);
  return [...issues, ...validateSpec(gx1Capabilities, spec)];
};

/**
 * Hands a validated block to its builder.
 *
 * Every block reaches this the same way, since every block takes the same shape: a `type` where the
 * device offers one, an optional `subType` and `on`, and one `params` bag. The `type` cast covers
 * only what `validatePatchSpec` has just established and TypeScript cannot see.
 */
const applyBlock = (patch: Patch, name: BlockName, input: Record<string, unknown>): void => {
  const type = input[TYPE_FIELD] as string;
  const on = input[ON_FIELD] as boolean | undefined;
  const subType = (input[SUB_TYPE_FIELD] ?? undefined) as string | undefined;
  const params = asRecord(input[PARAMS_FIELD]) as BlockParams;

  block(patch, name, { type, subType, on, params });
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
  for (const name of setBlocks(gx1Capabilities, spec)) applyBlock(patch, name as BlockName, asRecord(spec[name]));
  return patch;
};

export { applyBlock, buildPatch, validatePatchSpec };
export type { BlockName };
