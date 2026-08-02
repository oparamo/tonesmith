import { gx1, capabilityUtils } from "@tonesmith/core";
import type { ParamSpec } from "@tonesmith/core";

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

/**
 * The ParamSpecs in effect for a selection: the group's shared params, the chosen item's params,
 * and, when a subType is given and carries its own, that subType's params (e.g. a DELAY
 * sub-algorithm). Returns `[]` when the group or type isn't found, leaving the "unknown type"
 * error to the builder/codec rather than raising here.
 */
const specsForType = (group: string, type: string, subType?: string): ParamSpec[] => {
  try {
    const capGroup = capabilityUtils.findGroup(capabilities, group);
    const item = capabilityUtils.findItem(capGroup, type);
    const specs = [...(capGroup.params ?? []), ...(item.params ?? [])];
    const matchedSubType = subType === undefined
      ? undefined
      : item.subTypes?.find(candidate => candidate.id.toUpperCase() === subType.toUpperCase());
    if (matchedSubType?.params) specs.push(...matchedSubType.params);
    return specs;
  } catch {
    return [];
  }
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
 * Validates every supplied param value against the catalog spec for the chosen effect type:
 * numeric params by their per-type `min`/`max`, discrete params by their `values` list. `values`
 * is keyed by each param's `key` (the same key used in a block's `params` record and by the named
 * delay/reverb fields). Keys with no matching spec are ignored here, since the builder rejects
 * unknown keys at encode with its own message.
 */
const validateTypeParams = (addIssue: AddIssue, params: TypeParams): void => {
  const { group, type, subType, values } = params;
  const specs = specsForType(group, type, subType);
  if (specs.length === 0) return;
  const byKey = new Map(specs.flatMap(spec => (spec.key === undefined ? [] : [[spec.key, spec] as const])));
  for (const [key, value] of Object.entries(values)) {
    const spec = byKey.get(key);
    if (spec !== undefined) checkValue(addIssue, { group, type, spec, value });
  }
};

export { validateTypeParams };
export type { TypeParams };
