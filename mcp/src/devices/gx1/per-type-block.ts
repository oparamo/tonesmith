/**
 * Blocks whose controls are chosen by their `type`, as one schema per type.
 *
 * delay, reverb and pfx each hold a different set of controls depending on the type selected, and
 * the decoded patch carries those controls flat on the block. One schema covering every type could
 * only declare them all optional, with bounds wide enough for whichever type needed the widest, so
 * it advertised fields the chosen type doesn't have and accepted values it can't take. A
 * discriminated union declares each type's real fields with that type's own bounds, matching both
 * the decoded shape read_patch returns and the dot-paths write_fields takes.
 *
 * Built from the capability catalog rather than written out, so a type gains a param here the same
 * moment it gains one there.
 */
import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";
import type { CapabilityGroup, CapabilityItem } from "@tonesmith/core";
import { variantField } from "./param-ref";
import { blockSchema } from "./schemas";

const capabilities = gx1.driver.capabilities;
const { TYPE_FIELD, SUB_TYPE_FIELD } = gx1.spec;

/** The fields common to every variant, whatever the block and whatever the type. */
interface PerTypeBlockSpec {
  type: string;
  subType?: string;
  on?: boolean;
}

/** A validated per-type block: the common fields, plus whichever params the chosen type declares. */
type PerTypeBlockInput = PerTypeBlockSpec & Record<string, unknown>;

/** The fields that select the block's shape rather than set one of its controls. */
const SELECTION_FIELDS = new Set<string>([TYPE_FIELD, SUB_TYPE_FIELD, "on"]);

/**
 * A per-type block's params, which is everything it carries but its own selection. The builder
 * merges its named options into one bag before validating them against the chosen type, so handing
 * it the whole set this way is the shape it already works in.
 */
const blockParams = (block: PerTypeBlockInput): Record<string, unknown> =>
  Object.fromEntries(Object.entries(block).filter(([key]) => !SELECTION_FIELDS.has(key)));

/** A variant's fields: the `type` zod dispatches on, plus whatever else that type declares. */
type VariantShape = Record<string, z.ZodType> & { type: z.ZodLiteral<string> };

/**
 * One type's fields. `subType` appears only where that type has variants, and lists them, so there
 * is no rule left to state about which types accept the field.
 */
const variantShape = (group: CapabilityGroup, item: CapabilityItem): VariantShape => {
  // `type` goes in first so it reads first, in the JSON schema and in a rejection message alike,
  // and is repeated in the return so TypeScript sees the literal rather than the widened type the
  // index signature would give it. Re-assigning a key it already has doesn't move it.
  const type = z.literal(item.id);
  const fields: Record<string, z.ZodType> = { [TYPE_FIELD]: type };

  const variants = item.subTypes ?? [];
  if (variants.length > 0) {
    fields[SUB_TYPE_FIELD] = z.enum(variants.map(variant => variant.id)).optional();
  }

  for (const spec of [...(group.params ?? []), ...(item.params ?? [])]) {
    if (spec.key !== undefined) fields[spec.key] = variantField(spec);
  }

  fields.on = z.boolean().optional();
  return { ...fields, [TYPE_FIELD]: type };
};

/**
 * One per-type block's schema, as a union zod dispatches on `type`.
 *
 * The output type is asserted rather than inferred. Every variant declares `type` as a literal, so
 * a parsed block always has one, but the shapes are assembled from the catalog at runtime and all
 * TypeScript can infer from them is an index signature. The assertion states what the variants
 * guarantee; the round-trip tests are what check it.
 */
const perTypeBlock = (groupId: string): z.ZodType<PerTypeBlockInput> => {
  const group = capabilityUtils.findGroup(capabilities, groupId);
  if (group.items.length === 0) throw new Error(`Capability group "${groupId}" declares no types`);

  const [first, ...rest] = group.items.map(item => blockSchema(groupId, variantShape(group, item)));
  const union = z.discriminatedUnion(TYPE_FIELD, [first, ...rest]);
  return union as unknown as z.ZodType<PerTypeBlockInput>;
};

export { perTypeBlock, blockParams };
export type { PerTypeBlockInput };
