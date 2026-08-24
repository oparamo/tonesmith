/**
 * The device's dot-path edit surface: resolving each path, reading its value into the field it
 * names, and checking the result against the capability catalog.
 *
 * Resolving a path proves only that the field exists, which is a different question from whether
 * the value belongs in it: `amp.params.gain=abc` and `drive.params.tone=-500` both name real
 * fields. The encoder's byte guard rejects those in the end but knows only a byte index, so this is
 * what names the param and the range it accepts. The check runs on `validateTypeParams`, the same
 * function the spec validator uses, so the two write paths cannot drift in what they accept.
 *
 * Switching a block's type is part of that surface rather than a rebuild the caller has to go
 * elsewhere for: the block is re-seeded to the new type's factory settings as the edit lands, since
 * the controls it was carrying belong to the effect it has just stopped being.
 */
import { findGroup } from "../../../capability-utils";
import type { CapabilityGroup, CapabilityItem, FieldEdit, FieldEdits } from "../../../types";
import { gx1Capabilities } from "../capabilities";
import {
  BLOCK_GROUPS, SELECTION_FIELDS, ON_FIELD, PARAMS_FIELD, SUB_TYPE_FIELD, TYPE_FIELD,
  onlyBlockFor,
} from "../common";
import type { BlockName } from "../common";
import type { Patch } from "../types";
import {
  checkSelectors, checkTypeBelongsInBlock, resolveSelection, unknownTypeIssue, validateTypeParams,
  validatePatchSettings,
} from "./validate";
import type { Issues, Selectors } from "./validate";
import { applyBlock } from "./build";
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
 * (`name`, `chain`, a patch setting) or reaches deeper than a block's controls.
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

/** A path addressing no block is dropped here; `patchSettingEdits` is what picks those up. */
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
 * Whether a block's controls belong to the type it is set to rather than to the block as a whole.
 * An amp has the same controls whichever amp it models, so switching one has to leave the gain the
 * player dialed in; an fx slot's controls are the effect's own, so the previous effect's have to go.
 */
const controlsFollowType = (capGroup: CapabilityGroup): boolean =>
  capGroup.items.some(item => (item.params?.length ?? 0) > 0);

/** The same question of a sub-model: true only where picking one is what decides the controls. */
const controlsFollowSubType = (item: CapabilityItem): boolean =>
  (item.subTypes ?? []).some(variant => (variant.params?.length ?? 0) > 0);

/** A type the device offers somewhere, but not in this block. */
const belongsElsewhere = (name: BlockName, type: string): boolean => {
  const onlyBlock = onlyBlockFor(type);
  return onlyBlock !== undefined && onlyBlock !== name;
};

/** The block spec a re-seed builds from: the selection now on the block, and no controls at all. */
const factorySpec = (block: Record<string, unknown>, subType: unknown): Record<string, unknown> => ({
  [TYPE_FIELD]: block[TYPE_FIELD],
  [SUB_TYPE_FIELD]: subType,
  [ON_FIELD]: block[ON_FIELD],
  [PARAMS_FIELD]: {},
});

/**
 * Re-seeds a block whose selection an edit just changed, to the device's factory settings for the
 * selection it now carries.
 *
 * A decoded block holds only its current type's controls, so without this a switch leaves the
 * previous effect's values behind and the codec reads them under the new type's field map: a
 * compressor's sustain byte comes back as a delay time nobody chose. Re-seeding as the edit lands
 * rather than after the batch is also what makes a control of the new type a field the paths that
 * follow can find, so a type and a control of it can be set in one call.
 *
 * A selection the catalog cannot resolve, or one this block cannot hold, is left alone: the checks
 * that run after the batch report both, and the builder would throw here before they ever ran.
 */
const reseedBlock = (patch: Patch, name: BlockName, leaf: string): void => {
  const block = asRecord((patch as unknown as Record<string, unknown>)[name]);
  const type = asString(block[TYPE_FIELD]);
  if (type === undefined || belongsElsewhere(name, type)) return;
  const selection = resolveSelection(BLOCK_GROUPS[name], type);
  if (selection?.item === undefined) return;

  const isTypeEdit = leaf === TYPE_FIELD;
  const follows = isTypeEdit
    ? controlsFollowType(selection.capGroup)
    : controlsFollowSubType(selection.item);
  if (!follows) return;

  // A new type arrives on the device's factory sub-model, since the model the previous type was set
  // to names nothing under this one and the codec has no field map for the pairing.
  const subType = isTypeEdit ? undefined : block[SUB_TYPE_FIELD];
  applyBlock(patch, name, factorySpec(block, subType));
};

/** Re-seeds when the edit that landed picked a shape; every other path leaves its block alone. */
const reseedForEdit = (patch: Patch, path: string): void => {
  const target = editTarget(path);
  if (target === undefined || target.field.isParam) return;
  const { leaf } = target.field;
  if (leaf !== TYPE_FIELD && leaf !== SUB_TYPE_FIELD) return;
  reseedBlock(patch, target.block, leaf);
};

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
 * The edits that named a patch setting rather than a block. A setting sits at the top level of the
 * patch, so its path is a single segment, and the catalog decides which of those are settings:
 * `name` and `memo` land here too and pass through unchecked, having no spec to check against.
 */
const patchSettingEdits = (edits: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(edits).filter(([path]) => !path.includes(".")));

/**
 * Every problem with a set of edits, empty when they are all usable. The patch must already carry
 * them: each block's type comes from the patch, which is what lets a type change and a param of the
 * new type validate as the one consistent state they describe.
 */
const validateFieldEdits = (patch: Patch, edits: Record<string, unknown>): Issues => [
  ...validatePatchSettings(patchSettingEdits(edits)),
  ...[...editsByBlock(edits)].flatMap(([name, fields]) => blockIssues(patch, name, fields)),
];

/**
 * Applies a batch of edits in the order given and returns what each one wrote, throwing with every
 * problem at once when any of them is unusable.
 *
 * An unresolvable path lands nowhere and the rest of the batch still applies, because the check
 * that follows reads each block's selection off the patch: an edit setting a type and an edit
 * setting a param of that new type are one consistent state only once both are on it. Order is the
 * caller's, so a control named before the type that has it still resolves against the type the
 * block held at the time. Nothing reaches disk on a throw, since the caller writes the file only
 * after this returns.
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
    const previous = holder[key];
    const value = coerceValue(given, previous);
    holder[key] = value;
    applied[path] = value;
    // Only a selection that actually moved: re-seeding on a value the block already had would
    // discard the controls of a caller writing back the type a patch they just read reported.
    if (value !== previous) reseedForEdit(patch, path);
  }

  issues.push(...validateFieldEdits(patch, applied));
  if (issues.length > 0) throw new Error(issues.join("\n"));
  return applied;
};

export { applyEdits };
