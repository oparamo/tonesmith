import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { gx1, patchUtils, patchView } from "@tonesmith/core";
const { basePatch, amp, odds, fx, ns, fv, pfx, delay, reverb, normalizeChain, DEFAULT_CHAIN } = gx1;
import { ok, err } from "../../common";
import { FxBlockSchema, ON_FIELD_DESCRIPTION, bypassable } from "./schemas";
import { boundedNumber, boundedInt, describeParam } from "./param-ref";
import { capabilityItemIds, capabilityParamValues } from "./capability-text";
import { validateTypeParams } from "./validate-params";

const { CHAIN_EXAMPLE } = gx1;

const patchSpecSchema = z.object({
  name: z.string().max(13).describe("Patch name (max 13 characters)"),
  chain: z.array(z.string()).optional().describe(
    "Block order as an array, first element = first in the chain. Pass just the blocks you want to " +
    "move; a block you leave out is reinserted immediately after whichever block precedes it in the " +
    "default order, so it can shift along with that neighbor (it is NOT disabled — bypass a block " +
    "via its `on` field instead). List a block explicitly to place it yourself. \"OD\" is an alias " +
    "for \"OD/DS\". The response states the resolved full order. See `describe_device` items: [\"chain\"] for " +
    "the default order and how ordering/bypass work."
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
    validateTypeParams(msg => { ctx.addIssue(msg); }, "pfx", pfxBlock.type, undefined, pfxBlock.params ?? {});
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
    time: boundedNumber({ group: "delay", param: "TIME", type: "STANDARD" }),
    feedback: boundedInt({ group: "delay", param: "FEEDBACK", type: "STANDARD" }),
    level: boundedInt({ group: "delay", param: "LEVEL", type: "STANDARD" }),
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
    validateTypeParams(msg => { ctx.addIssue(msg); }, "delay", delayBlock.type, undefined, values);
  })).describe("Delay block. Omit to leave it off."),

  reverb: bypassable(z.object({
    type: z.string().describe(`Reverb type (${capabilityItemIds("reverb")})`),
    time: boundedNumber({ group: "reverb", param: "TIME", type: "HALL S" }),
    level: boundedInt({ group: "reverb", param: "LEVEL", type: "HALL S" }),
    preDelay: boundedNumber({ group: "reverb", param: "PRE-DELAY", type: "HALL S", note: "Defaults to 0." }).optional(),
    tone: boundedInt({ group: "reverb", param: "TONE", type: "HALL S", note: "Defaults to 0." }).optional(),
    density: boundedInt({ group: "reverb", param: "DENSITY", type: "HALL S", note: "Defaults to 5." }).optional(),
    direct: boundedInt({ group: "reverb", param: "DIRECT", type: "HALL S", note: "Defaults to 100." }).optional(),
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
    validateTypeParams(msg => { ctx.addIssue(msg); }, "reverb", reverbBlock.type, undefined, values);
  })).describe("Reverb block. Omit to leave it off."),
});

const inputSchema = z.object({
  outPath: z.string().describe(
    "Output file path (e.g. my-tone.tsl). Parent directories are created if missing. Saving upserts " +
    "by patch name: an existing patch of the same name is replaced, any other patch is appended, " +
    "and a missing file is created."
  ),
  setName: z.string().optional().describe(
    "Name for the patch set/library stored in the file. Defaults to the first patch's name — " +
    "provide it to name the set yourself. `outPath` still controls the filename on disk; this is " +
    "the internal set label."
  ),
  patches: z.array(patchSpecSchema).min(1).describe(
    "Every patch to save, in the order they should sit in the file. Pass a whole set in one call " +
    "rather than one call per patch — the file is written once, and this array's order is the " +
    "order on the device."
  ),
});

type PatchSpec = z.infer<typeof patchSpecSchema>;
type Patch = gx1.Patch;

// Every block is off in the base patch, so an omitted block needs no explicit disabling — just
// return. A block that IS provided is configured through its builder, which now sets `on` itself
// (default true); pass `on: false` to bypass it.
const applyOdds = (patch: Patch, oddsParams: PatchSpec["odds"]): void => {
  if (!oddsParams) return;
  odds(patch, oddsParams.type, oddsParams.drive, oddsParams.tone, oddsParams.level, oddsParams.direct, oddsParams.solo, oddsParams.soloLevel, oddsParams.on ?? true);
};

const applyPfx = (patch: Patch, pfxParams: PatchSpec["pfx"]): void => {
  if (!pfxParams) return;
  pfx(patch, pfxParams.type, pfxParams.params ?? {}, pfxParams.on ?? true);
};

const applyFxSlots = (patch: Patch, spec: PatchSpec): void => {
  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    const block = spec[slot];
    if (!block?.type || block.type === "NONE") continue;
    fx(patch, slot, block.type, block.subType ?? null, block.params ?? {}, block.on ?? true);
  }
};

const applyFv = (patch: Patch, fvParams: PatchSpec["fv"]): void => {
  if (!fvParams) return;
  fv(patch, fvParams.position, fvParams.min, fvParams.max, fvParams.curve);
};

const applyDelay = (patch: Patch, delayParams: PatchSpec["delay"]): void => {
  if (!delayParams) return;
  delay(patch, delayParams.type, delayParams.time, delayParams.feedback, delayParams.level, delayParams.highCut, delayParams.on ?? true, delayParams.params ?? {});
};

const applyReverb = (patch: Patch, reverbParams: PatchSpec["reverb"]): void => {
  if (!reverbParams) return;
  reverb(patch, reverbParams.type, reverbParams.time, reverbParams.level, reverbParams.preDelay, reverbParams.tone, reverbParams.density, reverbParams.direct, reverbParams.on ?? true, reverbParams.params ?? {});
};

/** Builds one decoded patch from its spec — every block the spec omits stays off at factory defaults. */
const buildPatch = (spec: PatchSpec): Patch => {
  const chain = spec.chain === undefined ? undefined : normalizeChain(spec.chain);
  const patch = basePatch(spec.name, chain, spec.key);

  const ampParams = spec.amp;
  amp(patch, ampParams.type, ampParams.gain, ampParams.bass, ampParams.middle, ampParams.treble, ampParams.speaker, ampParams.mic, ampParams.level, ampParams.solo, ampParams.soloLevel, ampParams.on ?? true);

  applyOdds(patch, spec.odds);
  applyPfx(patch, spec.pfx);
  applyFxSlots(patch, spec);

  if (spec.ns) {
    ns(patch, spec.ns.threshold, spec.ns.release, spec.ns.on ?? true, spec.ns.detect);
  }

  applyFv(patch, spec.fv);
  applyDelay(patch, spec.delay);
  applyReverb(patch, spec.reverb);
  return patch;
};

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

\`patches\` takes an array, so a whole set goes out in ONE call — pass every patch you intend to
save rather than calling this once per patch. The array's order is the order they sit in the file,
and the file is written once.

Signal chain: omit \`chain\` for the default order (${DEFAULT_CHAIN.join(", ")}), or list just the
blocks you want to move. Worked example: order ${JSON.stringify(CHAIN_EXAMPLE.input)} with
ns: { on: false } resolves to:
${CHAIN_EXAMPLE.resolution}
"OD" is shorthand for "OD/DS". See describe_device items: ["chain"] for the full rule.

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
        const file = patchUtils.upsertPatches(gx1.driver, params.outPath, built, params.setName);

        const results = built.map(patch => {
          const action = alreadySaved.has(patch.name) ? "replaced" : "appended";
          return {
            name: patch.name,
            action,
            // Confirm the resolved chain explicitly — a partial `chain` input expands to the full
            // block order, and without this a caller can't tell its reorder was honored.
            chain: patch.chain,
            // Echo back the built patch so the caller can confirm every field the builder defaulted,
            // without a follow-up read_patch.
            patch: patchView.presentPatch(patch),
          };
        });

        const fileVerb = namesBefore === undefined ? "Created" : "Updated";
        const summary =
          `${fileVerb} ${params.outPath} — saved ${built.length} patch(es), ` +
          `${file.patches.length} total in set "${file.name}"`;
        return ok(`${summary}\n\n${JSON.stringify(results, null, 2)}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerGeneratePatch };
