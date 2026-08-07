import { findGroup, findItem } from "../../../capability-utils";
import { gx1Capabilities } from "../capabilities";
import type { CapabilityGroup, CapabilityItem, ParamSpec } from "../../../types";

/** Every problem found with one block, empty when the block is usable. */
type Issues = string[];

/** What the caller selected and supplied for one block. */
interface TypeParams {
  group: string;
  type: string;
  subType?: string;
  values: Record<string, unknown>;
}

/** A block's selection resolved against capabilities: its group, and the item its `type` names. */
interface Selection {
  capGroup: CapabilityGroup;
  item: CapabilityItem;
}

/** Resolves a block's group and type, or undefined for either miss, leaving the "unknown type"
 *  error to the builder/codec (whose message lists the valid ids) rather than raising here. */
const resolveSelection = (group: string, type: string): Selection | undefined => {
  try {
    const capGroup = findGroup(gx1Capabilities, group);
    return { capGroup, item: findItem(capGroup, type) };
  } catch {
    return undefined;
  }
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
  const specs = [...(capGroup.params ?? []), ...(item.params ?? [])];
  const matchedSubType = subType === undefined
    ? undefined
    : item.subTypes?.find(candidate => matchesSubType(candidate, subType));
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
  type: string;
  spec: ParamSpec;
  value: unknown;
}

/** Range-checks a numeric value or enum-membership-checks a string value against one spec. */
const checkValue = (issues: Issues, check: ParamCheck): void => {
  const { group, type, spec, value } = check;
  if (typeof value === "number" && spec.min !== undefined && spec.max !== undefined) {
    if (value < spec.min || value > spec.max) {
      issues.push(`${group} ${spec.name} for ${type} must be ${spec.min}–${spec.max} (got ${value})`);
    }
    return;
  }
  if (typeof value === "string" && spec.values !== undefined && !spec.values.includes(value)) {
    issues.push(`${group} ${spec.name} for ${type} must be one of: ${spec.values.join(", ")} (got "${value}")`);
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
  if (subType !== undefined) checkSubType(issues, { group, type, item: selection.item, subType });

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
  if (typeof selected.type !== "string") return undefined;
  const selection = resolveSelection(selected.group, selected.type);
  if (selection === undefined) return undefined;

  const subType = typeof selected.subType === "string" ? selected.subType : undefined;
  return {
    paramKeys: specsForType(selection, subType).flatMap(spec => (spec.key === undefined ? [] : [spec.key])),
    subTypes: (selection.item.subTypes ?? []).map(variant => variant.id),
  };
};

export { validateTypeParams, typeSurface };
export type { Issues, TypeParams, TypeSurface };
