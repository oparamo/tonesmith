import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";

/** Every selectable FX1/FX2/FX3 effect type, sourced from gx1 capabilities so this can't drift from constants.ts. */
const fxTypeIds = capabilityUtils.findGroup(gx1.driver.capabilities, "fx").items.map(item => item.id).join(", ");

const FxBlockSchema = z.object({
  type: z.string().describe(`Effect type. One of: ${fxTypeIds}. (OVERTONE is FX3-only.)`),
  subType: z.string().optional().describe(
    "Model variant, only for effects that actually have one — not every effect does, and some effects " +
    "select their model via a numeric params entry instead (e.g. PHASER's TYPE, DELAY's TYPE, REVERB's " +
    "TYPE). Use describe_device with group=fx and the item's id to see whether it has a subType and, " +
    "if not, which params field selects its model."
  ),
  on: z.boolean().optional().describe("Whether the slot is active (default true)"),
  params: z.record(z.string(), z.number()).optional().describe(
    "Effect parameter values as name→number pairs. Parameter names and ranges are device-specific — " +
    "use describe_device with group=fx and the item's id for the authoritative list."
  ),
}).optional();

export { FxBlockSchema };
