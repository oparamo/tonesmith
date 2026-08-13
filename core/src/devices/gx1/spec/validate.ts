import { findGroup, findItem } from "../../../capability-utils";
import { gx1Capabilities } from "../capabilities";
import type { CapabilityGroup, CapabilityItem, ParamSpec } from "../../../types";

/** Every problem found with one block, empty when the block is usable. */
type Issues = string[];

/** What the caller selected and supplied for one block. */
interface TypeParams {
  group: string;
  /** Absent for a block whose group offers no types to choose between, such as NS and FV. */
  type?: string;
  subType?: string;
  values: Record<string, unknown>;
}

/** A block's selection resolved against capabilities: its group, and the item its `type` names. */
interface Selection {
  capGroup: CapabilityGroup;
  /** Absent for a group with no types, where the group's shared params are the whole surface. */
  item?: CapabilityItem;
}

const groupOrUndefined = (id: string): CapabilityGroup | undefined => {
  try {
    return findGroup(gx1Capabilities, id);
  } catch {
    return undefined;
  }
};

const itemOrUndefined = (group: CapabilityGroup, id: string): CapabilityItem | undefined => {
  try {
    return findItem(group, id);
  } catch {
    return undefined;
  }
};

/**
 * Resolves a block's group and type, or undefined for either miss. Tolerant of anything in `type`,
 * because its callers hold unvalidated input; a caller that needs the miss reported names the valid
 * ids itself rather than having this raise.
 */
const resolveSelection = (group: string, type?: unknown): Selection | undefined => {
  const capGroup = groupOrUndefined(group);
  if (capGroup === undefined) return undefined;
  if (capGroup.items.length === 0) return { capGroup };
  if (typeof type !== "string") return undefined;

  const item = itemOrUndefined(capGroup, type);
  if (item === undefined) return undefined;
  return { capGroup, item };
};

/** Variant ids are matched case-insensitively, the one place a caller's casing is forgiven. */
const matchesSubType = (candidate: CapabilityItem, subType: string): boolean =>
  candidate.id.toUpperCase() === subType.toUpperCase();

/**
 * The ParamSpecs in effect for a selection: the group's shared params, the chosen item's params,
 * and, when a subType is given and carries its own, that subType's params (e.g. a DELAY
 * sub-algorithm).
 */
const specsForType = (selection: Selection, subType?: string): ParamSpec[] => {
  const { capGroup, item } = selection;
  const specs = [...(capGroup.params ?? []), ...(item?.params ?? [])];
  const matchedSubType = subType === undefined
    ? undefined
    : item?.subTypes?.find(candidate => matchesSubType(candidate, subType));
  if (matchedSubType?.params) specs.push(...matchedSubType.params);
  return specs;
};

/** One block's subType alongside the capability item it was sent to. */
interface SubTypeCheck {
  group: string;
  type: string;
  item: CapabilityItem;
  subType: string;
}

/**
 * Where a variant selection belongs on an item that declares no subTypes. Some such items do have
 * a variant to pick, carried as an ordinary param the device labels TYPE, and naming that param's
 * key is what turns the rejection into a one-step fix rather than a dead end.
 */
const subTypeAlternative = (item: CapabilityItem): string => {
  const selector = item.params?.find(param => param.name === "TYPE");
  if (selector?.key === undefined) return "it has no variants to choose between";
  return `set params.${selector.key} instead (${selector.range})`;
};

/**
 * Rejects a subType the chosen type can't take, whether because it declares none or because this
 * isn't one of them. Either way the value would encode nowhere: the patch saves clean, plays as the
 * default, and nothing in the response says the selection was dropped. An unlisted variant is worse
 * than a missing one, since the codec's own rejection names only the value it couldn't look up.
 */
const checkSubType = (issues: Issues, check: SubTypeCheck): void => {
  const { group, type, item, subType } = check;
  const variants = item.subTypes ?? [];
  if (variants.length === 0) {
    issues.push(`${group} ${type} takes no subType (got "${subType}"): ${subTypeAlternative(item)}`);
    return;
  }
  if (variants.some(candidate => matchesSubType(candidate, subType))) return;
  const valid = variants.map(candidate => candidate.id).join(", ");
  issues.push(`${group} ${type} has no subType "${subType}". Valid subTypes: ${valid}`);
};

/** One param's value alongside the spec and selection it is checked against. */
interface ParamCheck {
  group: string;
  type?: string;
  spec: ParamSpec;
  value: unknown;
}

/** How a message names the param, dropping the type clause for a block that has no types. */
const paramLabel = (check: ParamCheck): string => {
  const named = `${check.group} ${check.spec.name}`;
  const label = check.type === undefined ? named : `${named} for ${check.type}`;
  return label;
};

/**
 * What kind of value a spec takes, or undefined where its domain names no kind to check against.
 * `boolean` and `values` each identify a kind outright; bounds identify a number but not whether a
 * fraction is legal, which is what `decimals` settles.
 */
const expectedKind = (spec: ParamSpec): string | undefined => {
  if (spec.boolean === true) return "true or false";
  if (spec.values !== undefined) return `one of: ${spec.values.join(", ")}`;
  if (spec.min === undefined || spec.max === undefined) return undefined;
  const numeric = spec.decimals === undefined ? "a whole number" : "a number";
  return numeric;
};

/** True when the value is the kind this spec takes at all, before asking whether it is in range. */
const isRightKind = (spec: ParamSpec, value: unknown): boolean => {
  if (spec.boolean === true) return typeof value === "boolean";
  if (spec.values !== undefined) return typeof value === "string";
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return spec.decimals !== undefined || Number.isInteger(value);
};

/**
 * Checks one value against one spec: that it is the kind the param takes, then that it is in range
 * or a member of the value list. The kind check leads because a value of the wrong kind passes both
 * of the others by falling through them, which is how a string threshold used to reach the codec.
 */
const checkValue = (issues: Issues, check: ParamCheck): void => {
  const { spec, value } = check;
  const kind = expectedKind(spec);
  if (kind !== undefined && !isRightKind(spec, value)) {
    issues.push(`${paramLabel(check)} takes ${kind} (got ${JSON.stringify(value)})`);
    return;
  }
  if (typeof value === "number" && spec.min !== undefined && spec.max !== undefined) {
    if (value < spec.min || value > spec.max) {
      issues.push(`${paramLabel(check)} must be ${spec.min}–${spec.max} (got ${value})`);
    }
    return;
  }
  if (typeof value === "string" && spec.values !== undefined && !spec.values.includes(value)) {
    issues.push(`${paramLabel(check)} must be one of: ${spec.values.join(", ")} (got "${value}")`);
  }
};

/**
 * Validates one block's selection against the catalog: that its `subType` is a variant this type
 * actually has, and that every supplied param value fits the spec for the chosen type (numeric
 * params by their per-type `min`/`max`, discrete params by their `values` list). `values` is keyed
 * by each param's `key` (the same key used in a block's `params` record and by the named
 * delay/reverb fields). Keys with no matching spec are ignored here, since the builder rejects
 * unknown keys at encode with its own message.
 */
const validateTypeParams = (params: TypeParams): Issues => {
  const { group, type, subType, values } = params;
  const issues: Issues = [];
  const selection = resolveSelection(group, type);
  if (selection === undefined) return issues;
  // A subType on a block with no types at all is an unrecognized key, already reported as one.
  if (subType !== undefined && type !== undefined && selection.item !== undefined) {
    checkSubType(issues, { group, type, item: selection.item, subType });
  }

  const specs = specsForType(selection, subType);
  const byKey = new Map(specs.flatMap(spec => (spec.key === undefined ? [] : [[spec.key, spec] as const])));
  for (const [key, value] of Object.entries(values)) {
    const spec = byKey.get(key);
    if (spec !== undefined) checkValue(issues, { group, type, spec, value });
  }
  return issues;
};

/** A block's selection as a rejection message finds it: read off input that already failed. */
interface Selected {
  group: string;
  type?: unknown;
  subType?: unknown;
}

/** What one type accepts: the params it takes, and the variants it offers, if any. */
interface TypeSurface {
  paramKeys: string[];
  subTypes: string[];
}

/**
 * The input surface of the chosen type, or undefined when nothing resolves it.
 *
 * Tolerant of anything in `type` and `subType`, because its callers hold unvalidated input: a
 * message deciding whether a rejected key was a real param in the wrong place, and one deciding
 * which fields are worth offering back. Not resolving is different from resolving to nothing, so
 * an unknown type is undefined here rather than an empty surface.
 */
const typeSurface = (selected: Selected): TypeSurface | undefined => {
  const selection = resolveSelection(selected.group, selected.type);
  if (selection === undefined) return undefined;

  const subType = typeof selected.subType === "string" ? selected.subType : undefined;
  return {
    paramKeys: specsForType(selection, subType).flatMap(spec => (spec.key === undefined ? [] : [spec.key])),
    subTypes: (selection.item?.subTypes ?? []).map(variant => variant.id),
  };
};

export { resolveSelection, validateTypeParams, typeSurface };
export type { Issues, Selection, TypeParams, TypeSurface };
