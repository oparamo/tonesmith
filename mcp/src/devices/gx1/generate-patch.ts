import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { gx1, capabilityUtils, patchUtils, patchView } from "@tonesmith/core";
const { basePatch, amp, odds, fx, ns, fv, pfx, delay, reverb, normalizeChain, DEFAULT_CHAIN } = gx1;
import { ok, err } from "../../common";
import { FxBlockSchema, ON_FIELD_DESCRIPTION } from "./schemas";
import { boundedNumber, boundedInt } from "./bounds";
import { validateTypeParams } from "./validate-params";

const capabilities = gx1.driver.capabilities;

// A non-contiguous reorder — the case where an omitted block visibly moves with its default
// predecessor, which is the part of the merge rule agents get wrong when it isn't spelled out.
const CHAIN_EXAMPLE_INPUT = ["FX1", "AMP", "FX2", "NS", "DLY", "REV"];

/** Every item id in a capability group, comma-separated — sourced from gx1 capabilities so it can't drift from constants.ts. */
const capabilityItemIds = (groupId: string): string =>
  capabilityUtils.findGroup(capabilities, groupId).items.map(item => item.id).join(", ");

const capabilityParamRange = (groupId: string, paramName: string): string =>
  capabilityUtils.findGroup(capabilities, groupId).params?.find(param => param.name === paramName)?.range ?? "";

/** Builds the type-catalog block of the tool description straight from gx1 capabilities, so it can't drift from constants.ts. */
const buildCatalog = (): string => {
  const pfxGroup = capabilityUtils.findGroup(capabilities, "pfx");
  const wahItem = capabilityUtils.findItem(pfxGroup, "WAH");
  const wahSubTypeIds = wahItem.subTypes?.map(subType => subType.id).join(", ") ?? "";

  return `Amp types: ${capabilityItemIds("amp")}
Speaker: ${capabilityItemIds("cab")}
Mic: ${capabilityItemIds("mic")}
Delay types: ${capabilityItemIds("delay")}
Reverb types: ${capabilityItemIds("reverb")}
Pedal FX types: ${capabilityItemIds("pfx")}
Wah types: ${wahSubTypeIds}
NS detect points: ${capabilityParamRange("ns", "DETECT")}
FV curves: ${capabilityParamRange("fv", "CURVE")}`;
};

const inputSchema = z.object({
  name: z.string().max(13).describe("Patch name (max 13 characters)"),
  setName: z.string().optional().describe(
    "Name for the patch set/library stored in the file. Defaults to the first patch's name — " +
    "provide it to name the set yourself. `outPath` still controls the filename on disk; this is " +
    "the internal set label."
  ),
  outPath: z.string().describe(
    "Output file path (e.g. my-tone.tsl). Parent directories are created if missing. " +
    "Generation upserts by patch name: an existing file with a patch of this name has it replaced; " +
    "otherwise the patch is appended; a missing file is created."
  ),
  chain: z.array(z.string()).optional().describe(
    "Block order as an array, first element = first in the chain. Pass just the blocks you want to " +
    "move; a block you leave out is reinserted immediately after whichever block precedes it in the " +
    "default order, so it can shift along with that neighbor (it is NOT disabled — bypass a block " +
    "via its `on` field instead). List a block explicitly to place it yourself. \"OD\" is an alias " +
    "for \"OD/DS\". The response states the resolved full order. See `describe_device gx1 chain` for " +
    "the default order and how ordering/bypass work."
  ),
  key: z.string().optional().describe(
    "Song key for HARMONIST's diatonic intervals: C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B (default C)"
  ),

  amp: z.object({
    type: z.string().describe("Amplifier model"),
    gain: boundedInt("amp", "GAIN").describe("Gain 0–120"),
    bass: boundedInt("amp", "BASS").describe("Bass EQ 0–100 (50=flat)"),
    middle: boundedInt("amp", "MIDDLE").describe("Mid EQ 0–100 (50=flat)"),
    treble: boundedInt("amp", "TREBLE").describe("Treble EQ 0–100 (50=flat)"),
    speaker: z.string().optional().describe("Cabinet model (default ORIGINAL)"),
    mic: z.string().optional().describe("Microphone model (default DYN57)"),
    level: boundedInt("amp", "LEVEL").optional().describe("Output level 0–100 (default 100)"),
    solo: z.boolean().optional().describe("Enable the solo level boost (default false)"),
    soloLevel: boundedInt("amp", "SOLO LEVEL").optional().describe("Output level while solo is engaged, 0–100 (default 50)"),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  }).describe("Amplifier block (required)"),

  odds: z.object({
    type: z.string().describe("OD/DS pedal type (e.g. BLUES OD, CRUNCH, METAL, DIST, FUZZ)"),
    drive: boundedInt("odds", "DRIVE").describe("Drive 1–120"),
    tone: boundedInt("odds", "TONE").describe("Tone −50–+50"),
    level: boundedInt("odds", "LEVEL").describe("Level 0–100"),
    direct: boundedInt("odds", "DIRECT").optional().describe("Direct mix 0–100 (default 0)"),
    solo: z.boolean().optional().describe("Enable the solo level boost (default false)"),
    soloLevel: boundedInt("odds", "SOLO LEVEL").optional().describe("Output level while solo is engaged, 0–100 (default 50)"),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  }).optional().describe("Overdrive/distortion block. Omit to leave it off."),

  pfx: z.object({
    type: z.string().describe(`Pedal FX type: ${capabilityItemIds("pfx")}`),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
      "Type-specific params (e.g. { wahType: \"CRY WAH\", level: 100, direct: 0, position: 100, min: 0, max: 100 } for WAH; " +
      "{ pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 } for PEDAL BEND)"
    ),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  }).superRefine((pfx, ctx) => {
    validateTypeParams(msg => { ctx.addIssue(msg); }, "pfx", pfx.type, undefined, pfx.params ?? {});
  }).optional().describe("Expression pedal effect block. Omit to leave it off."),

  fx1: FxBlockSchema.describe("FX1 slot (pre-amp or first in chain). Omit to leave empty."),
  fx2: FxBlockSchema.describe("FX2 slot. Omit to leave empty."),
  fx3: FxBlockSchema.describe("FX3 slot. Omit to leave empty."),

  ns: z.object({
    threshold: boundedInt("ns", "THRESHOLD").describe("Noise threshold 0–100"),
    release: boundedInt("ns", "RELEASE").describe("Release time 0–100"),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
    detect: z.string().optional().describe("Detection point: INPUT or NS INPUT (default INPUT)"),
  }).optional().describe("Noise suppressor. Omit to leave it off."),

  fv: z.object({
    position: boundedInt("fv", "POSITION").describe("Pedal position 0–100"),
    min: boundedInt("fv", "MIN").describe("Minimum volume 0–100"),
    max: boundedInt("fv", "MAX").describe("Maximum volume 0–100"),
    curve: z.string().optional().describe("Response curve: SLOW1, SLOW2, NORMAL, FAST (default NORMAL)"),
  }).optional().describe("Foot volume block. Omit to use defaults."),

  delay: z.object({
    type: z.string().describe(`Delay type (${capabilityItemIds("delay")})`),
    time: boundedNumber("delay", "TIME", "STANDARD").describe("Delay time in milliseconds, 1–2000."),
    feedback: boundedInt("delay", "FEEDBACK", "STANDARD").describe("Feedback 0–100"),
    level: boundedInt("delay", "LEVEL", "STANDARD").describe("Effect level 1–120"),
    highCut: z.string().optional().describe('High-cut freq (e.g. "2.5kHz", "FLAT")'),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
      "Type-specific params beyond the named controls above, keyed by each param's `key` from " +
      "describe_device (e.g. modRate/modDepth for MODULATE, mode/riseTime for TWIST, head for SPACE " +
      "ECHO). Call describe_device with group=delay and the chosen type for the keys, ranges, and " +
      "values. The common controls (time/feedback/level/highCut) are the named fields above — set " +
      "them there, not here."
    ),
  }).superRefine((delayBlock, ctx) => {
    const values = {
      time: delayBlock.time, feedback: delayBlock.feedback, level: delayBlock.level,
      highCut: delayBlock.highCut, ...(delayBlock.params ?? {}),
    };
    validateTypeParams(msg => { ctx.addIssue(msg); }, "delay", delayBlock.type, undefined, values);
  }).optional().describe("Delay block. Omit to leave it off."),

  reverb: z.object({
    type: z.string().describe(`Reverb type (${capabilityItemIds("reverb")})`),
    time: boundedNumber("reverb", "TIME", "HALL S").describe("Reverb time in seconds, 0.1–10.0."),
    level: boundedInt("reverb", "LEVEL", "HALL S").describe("Effect level 1–100"),
    preDelay: boundedNumber("reverb", "PRE-DELAY", "HALL S").optional().describe("Pre-delay in ms 0–200 (default 0)"),
    tone: boundedInt("reverb", "TONE", "HALL S").optional().describe("Tone EQ −50–+50 (default 0)"),
    density: boundedInt("reverb", "DENSITY", "HALL S").optional().describe("Density 1–10 (default 5)"),
    direct: boundedInt("reverb", "DIRECT", "HALL S").optional().describe("Direct level 0–100 (default 100)"),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
      "Type-specific params beyond the named controls above, keyed by each param's `key` from " +
      "describe_device (e.g. pitch/pitchLevel for SHIMMER, feedback/highCut for SUB DELAY). Call " +
      "describe_device with group=reverb and the chosen type for the keys, ranges, and values. The " +
      "common controls (time/level/preDelay/tone/density/direct) are the named fields above — set " +
      "them there, not here."
    ),
  }).superRefine((reverbBlock, ctx) => {
    const values = {
      time: reverbBlock.time, level: reverbBlock.level, preDelay: reverbBlock.preDelay,
      tone: reverbBlock.tone, density: reverbBlock.density, direct: reverbBlock.direct,
      ...(reverbBlock.params ?? {}),
    };
    validateTypeParams(msg => { ctx.addIssue(msg); }, "reverb", reverbBlock.type, undefined, values);
  }).optional().describe("Reverb block. Omit to leave it off."),
});

type GeneratePatchInput = z.infer<typeof inputSchema>;
type Patch = gx1.Patch;

// Every block is off in the base patch, so an omitted block needs no explicit disabling — just
// return. A block that IS provided is configured through its builder, which now sets `on` itself
// (default true); pass `on: false` to bypass it.
const applyOdds = (patch: Patch, oddsParams: GeneratePatchInput["odds"]): void => {
  if (!oddsParams) return;
  odds(patch, oddsParams.type, oddsParams.drive, oddsParams.tone, oddsParams.level, oddsParams.direct, oddsParams.solo, oddsParams.soloLevel, oddsParams.on ?? true);
};

const applyPfx = (patch: Patch, pfxParams: GeneratePatchInput["pfx"]): void => {
  if (!pfxParams) return;
  pfx(patch, pfxParams.type, pfxParams.params ?? {}, pfxParams.on ?? true);
};

const applyFxSlots = (patch: Patch, params: GeneratePatchInput): void => {
  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    const block = params[slot];
    if (!block?.type || block.type === "NONE") continue;
    fx(patch, slot, block.type, block.subType ?? null, block.params ?? {}, block.on ?? true);
  }
};

const applyFv = (patch: Patch, fvParams: GeneratePatchInput["fv"]): void => {
  if (!fvParams) return;
  fv(patch, fvParams.position, fvParams.min, fvParams.max, fvParams.curve);
};

const applyDelay = (patch: Patch, delayParams: GeneratePatchInput["delay"]): void => {
  if (!delayParams) return;
  delay(patch, delayParams.type, delayParams.time, delayParams.feedback, delayParams.level, delayParams.highCut, delayParams.on ?? true, delayParams.params ?? {});
};

const applyReverb = (patch: Patch, reverbParams: GeneratePatchInput["reverb"]): void => {
  if (!reverbParams) return;
  reverb(patch, reverbParams.type, reverbParams.time, reverbParams.level, reverbParams.preDelay, reverbParams.tone, reverbParams.density, reverbParams.direct, reverbParams.on ?? true, reverbParams.params ?? {});
};

/** Counts patches already saved at `path`, or 0 if the file doesn't exist yet. */
const countExistingPatches = (path: string): number => {
  try {
    return gx1.driver.readFile(path).patches.length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
};

const describeUpsertAction = (patchCountBefore: number, patchCountAfter: number): string => {
  if (patchCountBefore === 0) return "Created";
  const verb = patchCountAfter > patchCountBefore ? "Appended" : "Replaced";
  return verb;
};

const registerGeneratePatch = (server: McpServer): void => {
  server.registerTool(
    "generate_gx1_patch",
    {
      description: `Build a BOSS GX-1 patch from structured parameters and save it as a .tsl file.

Signal chain: omit \`chain\` to use the default order (${DEFAULT_CHAIN.join(", ")}), or pass just the
blocks you want to move, in order — a block you leave out is reinserted immediately after whichever
block precedes it in the default order, so it can shift along with that neighbor. For example,
${JSON.stringify(CHAIN_EXAMPLE_INPUT)} moves FX2 ahead of NS and resolves to
${JSON.stringify(normalizeChain(CHAIN_EXAMPLE_INPUT))} — FX3 and FV travel with FX2 and NS instead of
staying at their default slots. List a block explicitly to place it yourself. "OD" is shorthand for
"OD/DS". See describe_device gx1 chain for how ordering and bypass work.

Setting parameters: every block's type-specific params go in its \`params\` record, keyed by
the \`key\` shown by describe_device. fx1/fx2/fx3 and pfx have no named param fields, so their
\`params\` record holds every effect param. delay and reverb additionally expose their common
controls as named fields (time/feedback/level/…) — set those directly and put only the
remaining params in \`params\`. amp/odds/ns/fv are single-shape blocks whose params are named
fields. Rule of thumb: if a describe_device param's \`key\` matches a named field on the block,
set that field; otherwise put it in \`params[key]\`.

${buildCatalog()}`,
      inputSchema,
    },
    (params) => {
      try {
        const chain = params.chain === undefined ? undefined : normalizeChain(params.chain);
        const patch = basePatch(params.name, chain, params.key);

        const ampParams = params.amp;
        amp(patch, ampParams.type, ampParams.gain, ampParams.bass, ampParams.middle, ampParams.treble, ampParams.speaker, ampParams.mic, ampParams.level, ampParams.solo, ampParams.soloLevel, ampParams.on ?? true);

        applyOdds(patch, params.odds);
        applyPfx(patch, params.pfx);
        applyFxSlots(patch, params);

        if (params.ns) {
          ns(patch, params.ns.threshold, params.ns.release, params.ns.on ?? true, params.ns.detect);
        }

        applyFv(patch, params.fv);
        applyDelay(patch, params.delay);
        applyReverb(patch, params.reverb);

        const patchCountBefore = countExistingPatches(params.outPath);
        const file = patchUtils.upsertPatch(gx1.driver, params.outPath, patch, params.setName);
        const verb = describeUpsertAction(patchCountBefore, file.patches.length);
        const summary = `${verb} patch "${params.name}" → ${params.outPath} (${file.patches.length} patch(es) total)`;
        // Confirm the resolved chain explicitly — a partial `chain` input expands to the full
        // block order, and without this line a caller can't tell its reorder was honored.
        const chainLine = `chain resolved as: ${JSON.stringify(patch.chain)}`;
        // Echo back the built patch so the caller can confirm every field the builder defaulted,
        // without a follow-up read_patch.
        return ok(`${summary}\n${chainLine}\n\n${JSON.stringify(patchView.presentPatch(patch), null, 2)}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerGeneratePatch };
