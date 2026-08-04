import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { gx1, patchUtils, patchView } from "@tonesmith/core";
const { basePatch, amp, odds, fx, ns, fv, pfx, delay, reverb, validateChain, DEFAULT_CHAIN } = gx1;
import { ok, err } from "../../common";
import { FxBlockSchema, ON_FIELD_DESCRIPTION, bypassable, issueReporter } from "./schemas";
import { boundedInt, describeParam, spanningInt, spanningNumber } from "./param-ref";
import { capabilityItemIds, capabilityParamValues } from "./capability-text";
import { validateTypeParams } from "./validate-params";

const patchSpecSchema = z.object({
  name: z.string().max(13).describe("Patch name (max 13 characters)"),
  chain: z.array(z.string()).optional().describe(
    "Block order as an array, first element = first in the chain. Pass the complete order: every " +
    "block exactly once, copied from the default order with the blocks you care about moved. A " +
    "chain missing a block is rejected, and leaving a block out is not how it gets switched off " +
    "(bypass it via its `on` field, or leave its spec out of the patch). Omit this field entirely " +
    "to take the default order. \"OD\" is an alias for \"OD/DS\". See `describe_device` " +
    "items: [\"chain\"] for the default order and how ordering and bypass work."
  ),
  key: z.string().optional().describe(
    "Song key for HARMONIST's diatonic intervals: C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B (default C)"
  ),

  amp: z.object({
    type: z.string().describe(`Amplifier model: ${capabilityItemIds("amp")}`),
    gain: boundedInt({ group: "amp", param: "GAIN" }),
    bass: boundedInt({ group: "amp", param: "BASS" }),
    middle: boundedInt({ group: "amp", param: "MIDDLE" }),
    treble: boundedInt({ group: "amp", param: "TREBLE" }),
    speaker: z.string().optional().describe(`Cabinet model (default ORIGINAL): ${capabilityItemIds("cab")}`),
    mic: z.string().optional().describe(`Microphone model (default DYN57): ${capabilityItemIds("mic")}`),
    level: boundedInt({ group: "amp", param: "LEVEL", note: "Defaults to 100." }).optional(),
    solo: z.boolean().optional().describe(describeParam({ group: "amp", param: "SOLO", note: "Defaults to false." })),
    soloLevel: boundedInt({ group: "amp", param: "SOLO LEVEL", note: "Defaults to 50." }).optional(),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  }).describe("Amplifier block (required)"),

  odds: bypassable(z.object({
    type: z.string().describe(`OD/DS pedal type: ${capabilityItemIds("odds")}`),
    drive: boundedInt({ group: "odds", param: "DRIVE" }),
    tone: boundedInt({ group: "odds", param: "TONE" }),
    level: boundedInt({ group: "odds", param: "LEVEL" }),
    direct: boundedInt({ group: "odds", param: "DIRECT", note: "Defaults to 0." }).optional(),
    solo: z.boolean().optional().describe(describeParam({ group: "odds", param: "SOLO", note: "Defaults to false." })),
    soloLevel: boundedInt({ group: "odds", param: "SOLO LEVEL", note: "Defaults to 50." }).optional(),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  })).describe("Overdrive/distortion block. Omit to leave it off."),

  pfx: bypassable(z.object({
    type: z.string().describe(`Pedal FX type: ${capabilityItemIds("pfx")}`),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
      "Type-specific params (e.g. { wahType: \"CRY WAH\", level: 100, direct: 0, position: 100, min: 0, max: 100 } for WAH; " +
      "{ pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 } for PEDAL BEND)"
    ),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  }).superRefine((pfxBlock, ctx) => {
    validateTypeParams(issueReporter(ctx), {
      group: "pfx", type: pfxBlock.type, values: pfxBlock.params ?? {},
    });
  })).describe("Expression pedal effect block. Omit to leave it off."),

  fx1: bypassable(FxBlockSchema).describe("FX1 slot (pre-amp or first in chain). Omit to leave empty."),
  fx2: bypassable(FxBlockSchema).describe("FX2 slot. Omit to leave empty."),
  fx3: bypassable(FxBlockSchema).describe("FX3 slot. Omit to leave empty."),

  ns: bypassable(z.object({
    threshold: boundedInt({ group: "ns", param: "THRESHOLD" }),
    release: boundedInt({ group: "ns", param: "RELEASE" }),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
    detect: z.string().optional().describe(`Detection point (default INPUT): ${capabilityParamValues({ group: "ns", param: "DETECT" })}`),
  })).describe("Noise suppressor. Omit to leave it off."),

  fv: z.object({
    position: boundedInt({ group: "fv", param: "POSITION" }),
    min: boundedInt({ group: "fv", param: "MIN" }),
    max: boundedInt({ group: "fv", param: "MAX" }),
    curve: z.string().optional().describe(`Response curve (default NORMAL): ${capabilityParamValues({ group: "fv", param: "CURVE" })}`),
  }).optional().describe("Foot volume block. Omit to use defaults."),

  delay: bypassable(z.object({
    type: z.string().describe(`Delay type (${capabilityItemIds("delay")})`),
    time: spanningNumber({ group: "delay", param: "TIME", description: "Delay time, or the length of the effect sound for GLITCH." }).optional(),
    feedback: spanningInt({ group: "delay", param: "FEEDBACK", description: "Number of delay repeats." }).optional(),
    level: spanningInt({ group: "delay", param: "LEVEL", description: "Volume of the delay sound." }).optional(),
    highCut: z.string().optional().describe(`High-cut freq, exact string: ${capabilityParamValues({ group: "delay", param: "HIGH CUT", type: "STANDARD" })}`),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
      "Type-specific params beyond the named controls above, keyed by each param's `key` from " +
      "describe_device (e.g. modRate/modDepth for MODULATE, head for SPACE ECHO)."
    ),
  }).superRefine((delayBlock, ctx) => {
    const values = {
      time: delayBlock.time, feedback: delayBlock.feedback, level: delayBlock.level,
      highCut: delayBlock.highCut, ...(delayBlock.params ?? {}),
    };
    validateTypeParams(issueReporter(ctx), { group: "delay", type: delayBlock.type, values });
  })).describe("Delay block. Omit to leave it off."),

  reverb: bypassable(z.object({
    type: z.string().describe(`Reverb type (${capabilityItemIds("reverb")})`),
    time: spanningNumber({ group: "reverb", param: "TIME", description: "Reverb decay time, or delay time for SUB DELAY." }).optional(),
    level: spanningInt({ group: "reverb", param: "LEVEL", description: "Volume of the reverb sound." }).optional(),
    preDelay: spanningNumber({ group: "reverb", param: "PRE-DELAY", description: "Time until the reverb sound starts." }).optional(),
    tone: spanningInt({ group: "reverb", param: "TONE", description: "Tonal character of the reverb." }).optional(),
    density: spanningInt({ group: "reverb", param: "DENSITY", description: "Density of the reverb sound." }).optional(),
    direct: spanningInt({ group: "reverb", param: "DIRECT", description: "Volume of the direct sound." }).optional(),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
      "Type-specific params beyond the named controls above, keyed by each param's `key` from " +
      "describe_device (e.g. pitch/pitchLevel for SHIMMER, feedback/highCut for SUB DELAY)."
    ),
  }).superRefine((reverbBlock, ctx) => {
    const values = {
      time: reverbBlock.time, level: reverbBlock.level, preDelay: reverbBlock.preDelay,
      tone: reverbBlock.tone, density: reverbBlock.density, direct: reverbBlock.direct,
      ...(reverbBlock.params ?? {}),
    };
    validateTypeParams(issueReporter(ctx), { group: "reverb", type: reverbBlock.type, values });
  })).describe("Reverb block. Omit to leave it off."),
});

const inputSchema = z.object({
  outPath: z.string().describe(
    "Output file path (e.g. my-tone.tsl). Parent directories are created if missing. Saving upserts " +
    "by patch name: an existing patch of the same name is replaced, any other patch is appended, " +
    "and a missing file is created."
  ),
  setName: z.string().optional().describe(
    "Name for the patch set/library stored in the file. Defaults to the first patch's name, so " +
    "provide it to name the set yourself. `outPath` still controls the filename on disk; this is " +
    "the internal set label."
  ),
  patches: z.array(patchSpecSchema).min(1).describe(
    "Every patch to save, in the order they should sit in the file. Pass a whole set in one call " +
    "rather than one call per patch: the file is written once, and this array's order is the " +
    "order on the device."
  ),
});

type PatchSpec = z.infer<typeof patchSpecSchema>;
type Patch = gx1.Patch;

// Each block schema is shaped to match its builder's options, so a spec block passes straight
// through. An empty slot is skipped rather than disabled: every block starts off in the base patch.
const applyFxSlots = (patch: Patch, spec: PatchSpec): void => {
  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    const block = spec[slot];
    if (!block?.type || block.type === "NONE") continue;
    fx(patch, { slot, ...block });
  }
};

/** Builds one decoded patch from its spec. Every block the spec omits stays off at factory defaults. */
const buildPatch = (spec: PatchSpec): Patch => {
  const chain = spec.chain === undefined ? undefined : validateChain(spec.chain);
  const patch = basePatch(spec.name, chain, spec.key);

  amp(patch, spec.amp);
  if (spec.odds) odds(patch, spec.odds);
  if (spec.pfx) pfx(patch, spec.pfx);
  applyFxSlots(patch, spec);
  if (spec.ns) ns(patch, spec.ns);
  if (spec.fv) fv(patch, spec.fv);
  if (spec.delay) delay(patch, spec.delay);
  if (spec.reverb) reverb(patch, spec.reverb);
  return patch;
};

/**
 * The patch as the file holds it, rather than as the builder assembled it.
 *
 * A block's decoded shape is per-type, but the builder fills one struct covering every type, so the
 * built object carries fields the chosen type has no params for: a TERA ECHO reverb came back
 * carrying `time`, `density` and `preDelay`, none of which that type has. The codec drops them on
 * the way to bytes, so a round trip through it is what the caller would read back. This echo is
 * documented as the confirmation that replaces a follow-up read_patch, which is why it has to agree
 * with the file rather than with the builder.
 */
const asStored = (patch: Patch): Patch => gx1.driver.decodePatch(gx1.driver.encodePatch(patch));

/** Patch names already saved at `path`, or undefined when the file doesn't exist yet. */
const existingPatchNames = (path: string): string[] | undefined => {
  try {
    return gx1.driver.readFile(path).patches.map(patch => patch.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

const registerGeneratePatch = (server: McpServer): void => {
  server.registerTool(
    "generate_gx1_patch",
    {
      description: `Build BOSS GX-1 patches from structured parameters and save them as a .tsl file.

\`patches\` takes an array, so a whole set goes out in ONE call. Pass every patch you intend to
save rather than calling this once per patch. The array's order is the order they sit in the file,
and the file is written once.

Signal chain: omit \`chain\` for the default order (${DEFAULT_CHAIN.join(", ")}), or pass that whole
order with the blocks you want moved. Every block appears exactly once; a partial chain is rejected.
A block's position says nothing about whether it is on. "OD" is shorthand for "OD/DS". See
describe_device items: ["chain"] for the full rule.

Setting parameters: if a describe_device param's \`key\` matches a named field on the block, set
that field; otherwise put it in the block's \`params\` record under that key. Unset params take the
device's factory default for the chosen type, and the patch echoed back is the complete resulting
state.

Type ids and value ranges for every block come from describe_device.`,
      inputSchema,
    },
    (params) => {
      try {
        const built = params.patches.map(buildPatch);

        const namesBefore = existingPatchNames(params.outPath);
        const alreadySaved = new Set(namesBefore ?? []);
        const request = { path: params.outPath, patches: built, setName: params.setName };
        const file = patchUtils.upsertPatches(gx1.driver, request);

        const results = built.map(patch => {
          const stored = asStored(patch);
          const action = alreadySaved.has(stored.name) ? "replaced" : "appended";
          return {
            name: stored.name,
            action,
            // State the stored order outright, so a caller that omitted `chain` sees the default
            // it took rather than having to look it up.
            chain: stored.chain,
            // Echo back the stored patch so the caller can confirm every field the builder
            // defaulted, without a follow-up read_patch.
            patch: patchView.presentPatch(stored),
          };
        });

        const fileVerb = namesBefore === undefined ? "Created" : "Updated";
        const summary =
          `${fileVerb} ${params.outPath}: saved ${built.length} patch(es), ` +
          `${file.patches.length} total in set "${file.name}"`;
        return ok(`${summary}\n\n${JSON.stringify(results)}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerGeneratePatch };
