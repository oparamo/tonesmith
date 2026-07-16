import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";

/** Every selectable FX1/FX2/FX3 effect type, sourced from gx1 capabilities so this can't drift from constants.ts. */
const fxTypeIds = capabilityUtils.findGroup(gx1.driver.capabilities, "fx").items.map(item => item.id).join(", ");

const FxBlockSchema = z.object({
  type: z.string().describe(`Effect type. One of: ${fxTypeIds}. (OVERTONE is FX3-only.)`),
  subType: z.string().optional().describe(
    "Model variant, only for effects that actually have one — not every effect does. DELAY uses it to " +
    "pick its sub-algorithm (STANDARD, MODULATE, WARP, TWIST, GLITCH), each with its own param set; " +
    "some other effects instead select their model via a params entry (e.g. PHASER's TYPE, REVERB's " +
    "TYPE). Use describe_device with group=fx and the item's id to see whether it has a subType and, " +
    "if not, which params field selects its model."
  ),
  on: z.boolean().optional().describe("Whether the slot is active (default true)"),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe(
    "Effect parameter values as name→value pairs. Most are numbers, but some select a model or " +
    "mode by name instead (e.g. SLICER's pattern, HARMONIST's harmony) — use describe_device with " +
    "group=fx and the item's id for the authoritative list of names, ranges, and string values."
  ),
}).optional();

export { FxBlockSchema };
