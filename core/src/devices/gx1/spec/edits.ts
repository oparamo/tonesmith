/**
 * The device's dot-path edit surface: resolving each path, reading its value into the field it
 * names, and checking the result against the capability catalog.
 *
 * Resolving a path proves only that the field exists, which is a different question from whether
 * the value belongs in it: `amp.params.gain=abc` and `drive.params.tone=-500` both name real
 * fields. The encoder's byte guard rejects those in the end but knows only a byte index, so this is
 * what names the param and the range it accepts. The check runs on `validateTypeParams`, the same
 * function the spec validator uses, so the two write paths cannot drift in what they accept.
 */
import { findGroup } from "../../../capability-utils";
import type { FieldEdit, FieldEdits } from "../../../types";
import { gx1Capabilities } from "../capabilities";
import {
  BLOCK_GROUPS, SELECTION_FIELDS, ON_FIELD, PARAMS_FIELD, SUB_TYPE_FIELD, TYPE_FIELD,
} from "../common";
import type { BlockName } from "../common";
import type { Patch } from "../types";
import {
  checkSelectors, checkTypeBelongsInBlock, resolveSelection, unknownTypeIssue, validateTypeParams,
} from "./validate";
import type { Issues, Selectors } from "./validate";
import { asRecord } from "./errors";
import { coerceValue, fieldAt } from "./paths";

/** One edit resolved against the block it addresses. */
interface EditedField {
  leaf: string;
  /** A control of the block's chosen type, as opposed to a field selecting that type. */
  isParam: boolean;
  value: unknown;
}

const isBlockName = (name: string | undefined): name is BlockName =>
  name !== undefined && name in BLOCK_GROUPS;

/**
 * Which block and field a path addresses, or undefined for a path that names no block at all
 * (`name`, `key`, `chain`) or reaches deeper than a block's controls.
 *
 * Every block keeps its controls one level down in `params`, so the path says which kind of thing
 * it touches: `amp.on` is block state and `amp.params.gain` is a control.
 */
const editTarget = (path: string): { block: BlockName; field: Omit<EditedField, "value"> } | undefined => {
  const [head, ...rest] = path.split(".");
  if (!isBlockName(head)) return undefined;

  const [leaf, nestedLeaf, ...deeper] = rest;
  if (leaf === PARAMS_FIELD && nestedLeaf !== undefined && deeper.length === 0) {
    return { block: head, field: { leaf: nestedLeaf, isParam: true } };
  }
  if (leaf === undefined || nestedLeaf !== undefined || !SELECTION_FIELDS.has(leaf)) return undefined;
  return { block: head, field: { leaf, isParam: false } };
};

/** A path addressing no block is dropped rather than reported: the codec still has its say on it. */
const editsByBlock = (edits: Record<string, unknown>): Map<BlockName, EditedField[]> => {
  const byBlock = new Map<BlockName, EditedField[]>();
  for (const [path, value] of Object.entries(edits)) {
    const target = editTarget(path);
    if (target === undefined) continue;
    const found = byBlock.get(target.block) ?? [];
    found.push({ ...target.field, value });
    byBlock.set(target.block, found);
  }
  return byBlock;
};

const checkType = (issues: Issues, name: BlockName, value: unknown): void => {
  if (resolveSelection(BLOCK_GROUPS[name], value)?.item === undefined) {
    issues.push(unknownTypeIssue(findGroup(gx1Capabilities, BLOCK_GROUPS[name]), value));
    return;
  }
  checkTypeBelongsInBlock(issues, name, value);
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * The selection is read off the patch rather than off the edits, so it reflects a type set in the
 * same batch. Validating `fx1.params.time` against the type the block held before the batch would
 * reject an edit that is only inconsistent when the two are read apart.
 */
const blockIssues = (patch: Patch, name: BlockName, fields: EditedField[]): Issues => {
  const group = BLOCK_GROUPS[name];
  const block = asRecord((patch as unknown as Record<string, unknown>)[name]);
  const issues: Issues = [];
  const values: Record<string, unknown> = {};

  const selectors: Selectors = { group };
  for (const { leaf, isParam, value } of fields) {
    if (isParam) values[leaf] = value;
    else if (leaf === TYPE_FIELD) checkType(issues, name, value);
    else {
      const selector = leaf === ON_FIELD ? "on" : "subType";
      selectors[selector] = value;
    }
  }
  checkSelectors(issues, selectors);

  const selection = { group, type: asString(block[TYPE_FIELD]), subType: asString(block[SUB_TYPE_FIELD]) };
  issues.push(...validateTypeParams({ ...selection, values }));
  return issues;
};

/**
 * Every problem with a set of edits, empty when they are all usable. The patch must already carry
 * them: each block's type comes from the patch, which is what lets a type change and a param of the
 * new type validate as the one consistent state they describe.
 */
const validateFieldEdits = (patch: Patch, edits: Record<string, unknown>): Issues =>
  [...editsByBlock(edits)].flatMap(([name, fields]) => blockIssues(patch, name, fields));

/**
 * Applies a batch of edits in the order given and returns what each one wrote, throwing with every
 * problem at once when any of them is unusable.
 *
 * An unresolvable path lands nowhere and the rest of the batch still applies, because the check
 * that follows reads each block's selection off the patch: an edit setting a type and an edit
 * setting a param of that new type are one consistent state only once both are on it. Nothing
 * reaches disk on a throw, since the caller writes the file only after this returns.
 */
const applyEdits = (patch: Patch, edits: readonly FieldEdit[]): FieldEdits => {
  const fields = patch as unknown as Record<string, unknown>;
  const applied: FieldEdits = {};
  const issues: Issues = [];

  for (const [path, given] of edits) {
    const resolved = fieldAt(fields, path);
    if ("issue" in resolved) {
      issues.push(resolved.issue);
      continue;
    }
    const { holder, key } = resolved.field;
    const value = coerceValue(given, holder[key]);
    holder[key] = value;
    applied[path] = value;
  }

  issues.push(...validateFieldEdits(patch, applied));
  if (issues.length > 0) throw new Error(issues.join("\n"));
  return applied;
};

export { applyEdits };
