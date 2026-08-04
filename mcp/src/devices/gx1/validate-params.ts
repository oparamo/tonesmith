import { gx1, capabilityUtils } from "@tonesmith/core";
import type { CapabilityGroup, CapabilityItem, ParamSpec } from "@tonesmith/core";

const capabilities = gx1.driver.capabilities;

/** Reports one validation failure. Decoupled from zod so this module never imports it: the
 *  schema hooks pass `ctx.addIssue`, which accepts a plain string message. */
type AddIssue = (message: string) => void;

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
    const capGroup = capabilityUtils.findGroup(capabilities, group);
    return { capGroup, item: capabilityUtils.findItem(capGroup, type) };
  } catch {
    return undefined;
  }
};

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
    : item.subTypes?.find(candidate => candidate.id.toUpperCase() === subType.toUpperCase());
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
 * Rejects a subType on an item that declares none. The device holds a variant selection in one of
 * two places and only one of them is `subType`, so this value would encode nowhere: the patch saves
 * clean, plays as the default, and nothing in the response says the selection was dropped.
 */
const checkSubType = (addIssue: AddIssue, check: SubTypeCheck): void => {
  const { group, type, item, subType } = check;
  if (item.subTypes !== undefined && item.subTypes.length > 0) return;
  addIssue(`${group} ${type} takes no subType (got "${subType}"): ${subTypeAlternative(item)}`);
};

/** One param's value alongside the spec and selection it is checked against. */
interface ParamCheck {
  group: string;
  type: string;
  spec: ParamSpec;
  value: unknown;
}

/** Range-checks a numeric value or enum-membership-checks a string value against one spec. */
const checkValue = (addIssue: AddIssue, check: ParamCheck): void => {
  const { group, type, spec, value } = check;
  if (typeof value === "number" && spec.min !== undefined && spec.max !== undefined) {
    if (value < spec.min || value > spec.max) {
      addIssue(`${group} ${spec.name} for ${type} must be ${spec.min}–${spec.max} (got ${value})`);
    }
    return;
  }
  if (typeof value === "string" && spec.values !== undefined && !spec.values.includes(value)) {
    addIssue(`${group} ${spec.name} for ${type} must be one of: ${spec.values.join(", ")} (got "${value}")`);
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
const validateTypeParams = (addIssue: AddIssue, params: TypeParams): void => {
  const { group, type, subType, values } = params;
  const selection = resolveSelection(group, type);
  if (selection === undefined) return;
  if (subType !== undefined) checkSubType(addIssue, { group, type, item: selection.item, subType });

  const specs = specsForType(selection, subType);
  const byKey = new Map(specs.flatMap(spec => (spec.key === undefined ? [] : [[spec.key, spec] as const])));
  for (const [key, value] of Object.entries(values)) {
    const spec = byKey.get(key);
    if (spec !== undefined) checkValue(addIssue, { group, type, spec, value });
  }
};

export { validateTypeParams };
export type { TypeParams };
