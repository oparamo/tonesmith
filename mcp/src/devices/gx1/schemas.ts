import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";
import { validateTypeParams } from "./validate-params";

/** Every selectable FX1/FX2/FX3 effect type, sourced from gx1 capabilities so this can't drift from constants.ts. */
const fxTypeIds = capabilityUtils.findGroup(gx1.driver.capabilities, "fx").items.map(item => item.id).join(", ");

/**
 * The `on` field description shared by every bypassable block. Deliberately terse: this string is
 * serialized into the generate schema once per block on every call, so what bypassing actually
 * means — that it preserves the params passed with it, and that omitting a block is the other way
 * to leave it off — is explained once in the chain view rather than repeated here.
 */
const ON_FIELD_DESCRIPTION =
  "Active by default; set false to bypass the block. See describe_device chain for what bypass keeps.";

/** True when a block spec carries nothing but `on: false` — "this block is off", with no settings for it. */
const isBareBypass = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0 && entries.every(([key, entry]) => (key === "on" ? entry === false : entry === undefined));
};

/**
 * Makes a block accept a bare `{ on: false }` in addition to being omitted. Both say the same thing
 * — leave this block off at its factory defaults — and the builder writes identical bytes for them,
 * so a bare bypass is folded into the omitted case before validation rather than being a second code
 * path that could drift from the first. Every other input still goes through `block` untouched, so
 * its own required fields stay required.
 */
const bypassable = <T extends z.ZodType>(block: T): z.ZodType<z.output<T> | undefined> =>
  z.preprocess(
    value => (isBareBypass(value) ? undefined : value),
    block.optional()
  );

const FxBlockSchema = z.object({
  type: z.string().describe(`Effect type. One of: ${fxTypeIds}. (OVERTONE is FX3-only.)`),
  subType: z.string().optional().describe(
    "Required for effects whose describe_device entry lists `subTypes`, and unused for those that " +
    "don't. Anything else shaping the sound is an ordinary entry in `params`."
  ),
  on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
    "Every effect parameter, keyed by each param's `key` from describe_device (e.g. preDelay, " +
    "octFeedback) — not its display name. An fx slot has no named param fields, so all of them live here."
  ),
}).superRefine((fx, ctx) => {
  validateTypeParams(msg => { ctx.addIssue(msg); }, "fx", fx.type, fx.subType, fx.params ?? {});
});

export { FxBlockSchema, ON_FIELD_DESCRIPTION, bypassable, isBareBypass };
