import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { gx1, capabilityUtils, patchUtils, patchView } from "@tonesmith/core";
const { basePatch, amp, odds, fx, ns, fv, pfx, delay, reverb, normalizeChain, DEFAULT_CHAIN } = gx1;
import { ok, err } from "../../common";
import { FxBlockSchema, ON_FIELD_DESCRIPTION, bypassable } from "./schemas";
import { boundedNumber, boundedInt } from "./bounds";
import { validateTypeParams } from "./validate-params";

const capabilities = gx1.driver.capabilities;

const { CHAIN_EXAMPLE } = gx1;

/** Every item id in a capability group, comma-separated — sourced from gx1 capabilities so it can't drift from constants.ts. */
const capabilityItemIds = (groupId: string): string =>
  capabilityUtils.findGroup(capabilities, groupId).items.map(item => item.id).join(", ");

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

  odds: bypassable(z.object({
    type: z.string().describe("OD/DS pedal type (e.g. BLUES OD, CRUNCH, METAL, DIST, FUZZ)"),
    drive: boundedInt("odds", "DRIVE").describe("Drive 1–120"),
    tone: boundedInt("odds", "TONE").describe("Tone −50–+50"),
    level: boundedInt("odds", "LEVEL").describe("Level 0–100"),
    direct: boundedInt("odds", "DIRECT").optional().describe("Direct mix 0–100 (default 0)"),
    solo: z.boolean().optional().describe("Enable the solo level boost (default false)"),
    soloLevel: boundedInt("odds", "SOLO LEVEL").optional().describe("Output level while solo is engaged, 0–100 (default 50)"),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  })).describe("Overdrive/distortion block."),

  pfx: bypassable(z.object({
    type: z.string().describe(`Pedal FX type: ${capabilityItemIds("pfx")}`),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
      "Type-specific params (e.g. { wahType: \"CRY WAH\", level: 100, direct: 0, position: 100, min: 0, max: 100 } for WAH; " +
      "{ pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 } for PEDAL BEND)"
    ),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
  }).superRefine((pfxBlock, ctx) => {
    validateTypeParams(msg => { ctx.addIssue(msg); }, "pfx", pfxBlock.type, undefined, pfxBlock.params ?? {});
  })).describe("Expression pedal effect block."),

  fx1: bypassable(FxBlockSchema).describe("FX1 slot (pre-amp or first in chain). Omit to leave empty."),
  fx2: bypassable(FxBlockSchema).describe("FX2 slot. Omit to leave empty."),
  fx3: bypassable(FxBlockSchema).describe("FX3 slot. Omit to leave empty."),

  ns: bypassable(z.object({
    threshold: boundedInt("ns", "THRESHOLD").describe("Noise threshold 0–100"),
    release: boundedInt("ns", "RELEASE").describe("Release time 0–100"),
    on: z.boolean().optional().describe(ON_FIELD_DESCRIPTION),
    detect: z.string().optional().describe("Detection point: INPUT or NS INPUT (default INPUT)"),
  })).describe("Noise suppressor."),

  fv: z.object({
    position: boundedInt("fv", "POSITION").describe("Pedal position 0–100"),
    min: boundedInt("fv", "MIN").describe("Minimum volume 0–100"),
    max: boundedInt("fv", "MAX").describe("Maximum volume 0–100"),
    curve: z.string().optional().describe("Response curve: SLOW1, SLOW2, NORMAL, FAST (default NORMAL)"),
  }).optional().describe("Foot volume block. Omit to use defaults."),

  delay: bypassable(z.object({
    type: z.string().describe(`Delay type (${capabilityItemIds("delay")})`),
    time: boundedNumber("delay", "TIME", "STANDARD").describe("Delay time in milliseconds, 1–2000."),
    feedback: boundedInt("delay", "FEEDBACK", "STANDARD").describe("Feedback 0–100"),
    level: boundedInt("delay", "LEVEL", "STANDARD").describe("Effect level 1–120"),
    highCut: z.string().optional().describe('High-cut freq (e.g. "2.5kHz", "FLAT")'),
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
  })).describe("Delay block."),

  reverb: bypassable(z.object({
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
      "describe_device (e.g. pitch/pitchLevel for SHIMMER, feedback/highCut for SUB DELAY)."
    ),
  }).superRefine((reverbBlock, ctx) => {
    const values = {
      time: reverbBlock.time, level: reverbBlock.level, preDelay: reverbBlock.preDelay,
      tone: reverbBlock.tone, density: reverbBlock.density, direct: reverbBlock.direct,
      ...(reverbBlock.params ?? {}),
    };
    validateTypeParams(msg => { ctx.addIssue(msg); }, "reverb", reverbBlock.type, undefined, values);
  })).describe("Reverb block."),
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
