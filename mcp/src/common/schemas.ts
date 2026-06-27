import { z } from "zod";

const FxBlockSchema = z.object({
  type: z.string().describe(
    "Effect type (e.g. CHORUS, COMPRESSOR, PHASER, FLANGER, TREMOLO, VIBRATO, ROTARY, " +
    "ENHANCER, HIGH GEQ, LOW GEQ, WAH, AUTO WAH, SLICER, PITCH SHIFT, HARMONIST, " +
    "DELAY, REVERB, CHORUS/DLY, etc.)"
  ),
  subType: z.string().optional().describe(
    "Effect subtype where applicable (e.g. STEREO/MONO for CHORUS; " +
    "ORANGE/BOSS COMP/HI-BAND for COMPRESSOR; 4-STAGE/8-STAGE/12-STAGE for PHASER)"
  ),
  on: z.boolean().optional().describe("Whether the slot is active (default true)"),
  params: z.record(z.string(), z.number()).optional().describe(
    "Effect parameter values as name→number pairs. Parameter names and ranges are " +
    "device-specific — consult the GX-1 parameter guide."
  ),
}).optional();

export { FxBlockSchema };
