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

const FxBlockSchema = z.object({
  type: z.string().describe(`Effect type. One of: ${fxTypeIds}. (OVERTONE is FX3-only.)`),
  subType: z.string().optional().describe(
    "Model variant, only for effects that actually have one — not every effect does. Any effect that " +
    "lists `subTypes` in describe_device selects its model here (e.g. COMPRESSOR's ORANGE, REVERB's " +
    "HALL M, DELAY's STANDARD/MODULATE/WARP/TWIST/GLITCH — each delay sub-algorithm has its own param " +
    "set); this is the only model-selection mechanism. An effect without `subTypes` has no model " +
    "variant — everything else that shapes its sound (e.g. PHASER's stage, SLICER's pattern) is an " +
    "ordinary entry in `params`. Use describe_device with group=fx and the item's id to see an " +
    "effect's subTypes, params, and values."
  ),
  on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
    "Every effect parameter as key→value pairs (an fx slot has no named param fields, so all of its " +
    "params live here). The key is each param's `key` from describe_device (group=fx, the item's id) " +
    "— e.g. preDelay, octFeedback — NOT its display name. Most values are numbers, but some select a " +
    "model or mode by name (e.g. SLICER's pattern, HARMONIST's harmony); describe_device lists each " +
    "param's key, range, and (for lookups) its exact string values."
  ),
}).superRefine((fx, ctx) => {
  validateTypeParams(msg => { ctx.addIssue(msg); }, "fx", fx.type, fx.subType, fx.params ?? {});
}).optional();

export { FxBlockSchema, ON_FIELD_DESCRIPTION };
