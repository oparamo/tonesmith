import { z } from "zod";
import { gx1 } from "@tonesmith/core";
import { capabilityItemIds } from "./capability-text";

/** Every selectable FX1/FX2/FX3 effect type, sourced from gx1 capabilities so this can't drift from constants.ts. */
const fxTypeIds = capabilityItemIds("fx");

/**
 * Bridges core's rejection-message pieces back to a zod error map, for keys a block schema doesn't
 * declare. `fields` is the schema's own key list, so the message can't drift from what the schema
 * accepts, and a key counts as misplaced only where the block has a `params` record to have
 * misplaced it from. Temporary: it goes with this file once the schemas do.
 */
const unrecognizedKeyError = (group: string, fields: string[]): z.core.$ZodErrorMap => issue => {
  if (issue.code !== "unrecognized_keys") return undefined;

  const block = gx1.spec.blockContext(group, issue.input);
  const paramKeys = block.surface?.paramKeys ?? [];
  const misplaced = fields.includes(gx1.spec.PARAMS_FIELD) ? issue.keys.filter(key => paramKeys.includes(key)) : [];
  const unknown = issue.keys.filter(key => !misplaced.includes(key));

  const misplacedText = misplaced.length > 0 ? [gx1.spec.misplacedLine(misplaced, block)] : [];
  const unknownText = unknown.length > 0 ? [gx1.spec.unknownLine(unknown)] : [];
  return [...misplacedText, ...unknownText, gx1.spec.shapeSkeleton(fields, block)].join("\n");
};

/**
 * What bypassing actually means (that it preserves the params passed with it, and that leaving the
 * block's spec out is the other way to leave it off) is explained once in the chain view. Every
 * mention of bypass in this schema points there rather than restating it: these strings are
 * serialized on every call, and there are a dozen places that would otherwise say it.
 */
const BYPASS_REFERENCE = "See describe_device chain for what bypass keeps.";

/** The `on` field description, for the blocks that declare one schema apiece. */
const ON_FIELD_DESCRIPTION = `Active by default; set false to bypass the block. ${BYPASS_REFERENCE}`;

/**
 * A per-type block's own description, carrying the bypass note its variants leave out. A block with
 * eleven types would otherwise serialize that note eleven times, for one field meaning the same
 * thing in each.
 */
const perTypeBlockDescription = (summary: string): string =>
  `${summary} Omit to leave it off, or set on: false to bypass it. ${BYPASS_REFERENCE}`;

/**
 * The `subType` field description, needed only by the fx slots. Every other block declares its
 * variants per type, so its schema lists the valid ones outright; an fx slot takes one field for
 * all 39 types and has to state the rule instead.
 */
const SUB_TYPE_DESCRIPTION =
  "The variant to use, for types whose describe_device entry lists `subTypes`. A type with no such " +
  "list rejects this field, and any variant it does have is an ordinary entry in `params`.";

/**
 * A block schema that answers a rejected key with the shape it does accept. `group` names the block
 * for the message; the accepted fields come from `shape` itself, so the two can't disagree.
 */
const blockSchema = <T extends z.core.$ZodLooseShape>(group: string, shape: T): z.ZodObject<T, z.core.$strict> =>
  z.strictObject(shape, { error: unrecognizedKeyError(group, Object.keys(shape)) });

/** True when a block spec carries nothing but `on: false`: this block is off, with no settings. */
const isBareBypass = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0 && entries.every(([key, entry]) => (key === "on" ? entry === false : entry === undefined));
};

/**
 * Makes a block accept a bare `{ on: false }` in addition to being omitted. Both say the same
 * thing, leave this block off at its factory defaults, and the builder writes identical bytes for
 * them, so a bare bypass is folded into the omitted case before validation rather than being a
 * second code path that could drift from the first. Every other input still goes through `block`
 * untouched, so its own required fields stay required.
 */
const bypassable = <T extends z.ZodType>(block: T): z.ZodType<z.output<T> | undefined> =>
  z.preprocess(
    value => (isBareBypass(value) ? undefined : value),
    block.optional()
  );

// The one block that keeps a `params` record. Its 39 types across 98 type/subType combinations
// would cost roughly 35 KB as per-type variants, paid on every request, against per-type validation
// that already runs at parse time and a describe_device lookup paid once.
const FxBlockSchema = blockSchema("fx", {
  type: z.string().describe(`Effect type. One of: ${fxTypeIds}. (OVERTONE is FX3-only.)`),
  subType: z.string().optional().describe(SUB_TYPE_DESCRIPTION),
  on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
    "Every effect parameter, keyed by each param's `key` from describe_device (e.g. preDelay, " +
    "octFeedback) rather than its display name. An fx slot has no named param fields, so all of " +
    "them live here."
  ),
}).superRefine((fx, ctx) => {
  const issues = gx1.spec.validateTypeParams({
    group: "fx", type: fx.type, subType: fx.subType, values: fx.params ?? {},
  });
  for (const issue of issues) ctx.addIssue(issue);
});

export {
  FxBlockSchema,
  ON_FIELD_DESCRIPTION,
  blockSchema,
  bypassable,
  isBareBypass,
  perTypeBlockDescription,
};
