/**
 * Checks dot-path edits against the device's capability catalog.
 *
 * `setByPath` proves only that the field exists, which is a different question from whether the
 * value belongs in it: `amp.gain=abc` and `odds.tone=-500` both name real fields. The encoder's
 * byte guard rejects them in the end but knows only a byte index, so this is what names the param
 * and the range it accepts. It runs on `validateTypeParams`, the same function the spec validator
 * uses, so the two write paths cannot drift in what they accept.
 */
import { findGroup } from "../../../capability-utils";
import { gx1Capabilities } from "../capabilities";
import {
  BLOCK_GROUPS, NESTED_PARAMS, SELECTION_FIELDS,
  ON_FIELD, PARAMS_FIELD, SUB_TYPE_FIELD, TYPE_FIELD,
} from "../common";
import type { BlockName } from "../common";
import type { Patch } from "../types";
import {
  checkSelectors, checkTypeBelongsInBlock, resolveSelection, unknownTypeIssue, validateTypeParams,
} from "./validate";
import type { Issues, Selectors } from "./validate";
import { asRecord } from "./errors";

/** One edit resolved against the block it addresses. */
interface EditedField {
  leaf: string;
  /** A control of the block's chosen type, as opposed to a field selecting that type. */
  isParam: boolean;
  value: unknown;
}

const isBlockName = (name: string): name is BlockName => name in BLOCK_GROUPS;

/**
 * Which block and field a path addresses, or undefined for a path that names no block at all
 * (`name`, `key`, `chain`) or reaches deeper than a block's controls.
 *
 * The fx slots keep their controls one level down in `params`, so the same field name means a
 * control there and a type selector on every other block.
 */
const editTarget = (path: string): { block: BlockName; field: Omit<EditedField, "value"> } | undefined => {
  const [head, ...rest] = path.split(".");
  if (!isBlockName(head)) return undefined;

  const nested = NESTED_PARAMS.has(head);
  if (nested && rest.length === 2 && rest[0] === PARAMS_FIELD) {
    return { block: head, field: { leaf: rest[1], isParam: true } };
  }
  if (rest.length !== 1) return undefined;
  return { block: head, field: { leaf: rest[0], isParam: !nested && !SELECTION_FIELDS.has(rest[0]) } };
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

export { validateFieldEdits };
