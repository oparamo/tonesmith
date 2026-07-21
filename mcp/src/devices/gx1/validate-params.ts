import { gx1, capabilityUtils } from "@tonesmith/core";
import type { ParamSpec } from "@tonesmith/core";

const capabilities = gx1.driver.capabilities;

/** Reports one validation failure. Decoupled from zod so this module never imports it — the
 *  schema hooks pass `ctx.addIssue` (which accepts a plain string message). */
type AddIssue = (message: string) => void;

/**
 * The ParamSpecs in effect for a `(group, type, subType)` selection: the group's shared params,
 * the chosen item's params, and — when a subType is given and carries its own — that subType's
 * params (e.g. a DELAY sub-algorithm). Returns `[]` when the group or type isn't found, leaving
 * the "unknown type" error to the builder/codec rather than raising here.
 */
const specsForType = (group: string, type: string, subType?: string): ParamSpec[] => {
  try {
    const grp = capabilityUtils.findGroup(capabilities, group);
    const item = capabilityUtils.findItem(grp, type);
    const specs = [...(grp.params ?? []), ...(item.params ?? [])];
    const sub = subType === undefined
      ? undefined
      : item.subTypes?.find(candidate => candidate.id.toUpperCase() === subType.toUpperCase());
    if (sub?.params) specs.push(...sub.params);
    return specs;
  } catch {
    return [];
  }
};

/** Range-checks a numeric value or enum-membership-checks a string value against one spec. */
const checkValue = (addIssue: AddIssue, label: string, type: string, spec: ParamSpec, value: unknown): void => {
  if (typeof value === "number" && spec.min !== undefined && spec.max !== undefined) {
    if (value < spec.min || value > spec.max) {
      addIssue(`${label} ${spec.name} for ${type} must be ${spec.min}–${spec.max} (got ${value})`);
    }
    return;
  }
  if (typeof value === "string" && spec.values !== undefined && !spec.values.includes(value)) {
    addIssue(`${label} ${spec.name} for ${type} must be one of: ${spec.values.join(", ")} (got "${value}")`);
  }
};

/**
 * Validates every supplied param value against the catalog spec for the chosen effect type:
 * numeric params by their per-type `min`/`max`, discrete params by their `values` list. `values`
 * is keyed by each param's `key` (the same key used in a block's `params` record and by the named
 * delay/reverb fields). Keys with no matching spec are ignored here — the builder rejects unknown
 * keys at encode with its own message.
 */
const validateTypeParams = (
  addIssue: AddIssue,
  group: string,
  type: string,
  subType: string | undefined,
  values: Record<string, unknown>,
): void => {
  const specs = specsForType(group, type, subType);
  if (specs.length === 0) return;
  const byKey = new Map(specs.flatMap(spec => (spec.key === undefined ? [] : [[spec.key, spec] as const])));
  for (const [key, value] of Object.entries(values)) {
    const spec = byKey.get(key);
    if (spec !== undefined) checkValue(addIssue, group, type, spec, value);
  }
};

export { validateTypeParams };
