import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { gx1, capabilityUtils, patchUtils } from "@tonesmith/core";
const { basePatch, amp, odds, clearOdds, fx, ns, fv, pfx, delay, reverb, normalizeChain } = gx1;
import { ok, err } from "../../common";
import { FxBlockSchema } from "./schemas";

const capabilities = gx1.driver.capabilities;

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
  outPath: z.string().describe(
    "Output file path (e.g. my-tone.tsl). Parent directories are created if missing. " +
    "Generation upserts by patch name: an existing file with a patch of this name has it replaced; " +
    "otherwise the patch is appended; a missing file is created."
  ),
  chain: z.array(z.string()).optional().describe(
    'Signal chain as an ordered array of block names, first element = first in the chain ' +
    '(e.g. ["FX1","OD","AMP","NS","DLY","REV"]). Omitted blocks are inserted at their default relative ' +
    'position (default full chain: PFX, FX1, OD/DS, AMP, NS, FV, FX2, FX3, DLY, REV). "OD" is an alias for "OD/DS".'
  ),
  key: z.string().optional().describe(
    "Song key for HARMONIST's diatonic intervals: C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B (default C)"
  ),

  amp: z.object({
    type: z.string().describe("Amplifier model"),
    gain: z.number().int().min(0).max(120).describe("Gain 0–120"),
    bass: z.number().int().min(0).max(100).describe("Bass EQ 0–100 (50=flat)"),
    mid: z.number().int().min(0).max(100).describe("Mid EQ 0–100 (50=flat)"),
    treble: z.number().int().min(0).max(100).describe("Treble EQ 0–100 (50=flat)"),
    speaker: z.string().optional().describe("Cabinet model (default ORIGINAL)"),
    mic: z.string().optional().describe("Microphone model (default DYN57)"),
    level: z.number().int().min(0).max(100).optional().describe("Output level 0–100 (default 100)"),
    solo: z.boolean().optional().describe("Enable the solo level boost (default false)"),
    soloLevel: z.number().int().min(0).max(100).optional().describe("Output level while solo is engaged, 0–100 (default 50)"),
  }).describe("Amplifier block (required)"),

  odds: z.object({
    type: z.string().describe("OD/DS pedal type (e.g. BLUES OD, CRUNCH, METAL, DIST, FUZZ)"),
    drive: z.number().int().min(1).max(120).describe("Drive 1–120"),
    tone: z.number().int().min(-50).max(50).describe("Tone −50–+50"),
    level: z.number().int().min(0).max(100).describe("Level 0–100"),
    direct: z.number().int().min(0).max(100).optional().describe("Direct mix 0–100 (default 0)"),
    solo: z.boolean().optional().describe("Enable the solo level boost (default false)"),
    soloLevel: z.number().int().min(0).max(100).optional().describe("Output level while solo is engaged, 0–100 (default 50)"),
  }).optional().describe("Overdrive/distortion block. Omit to disable."),

  pfx: z.object({
    type: z.string().describe(`Pedal FX type: ${capabilityItemIds("pfx")}`),
    params: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe(
      "Type-specific params (e.g. { wahType: \"CRY WAH\", level: 100, direct: 0, position: 100, min: 0, max: 100 } for WAH; " +
      "{ pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 } for PEDAL BEND)"
    ),
    on: z.boolean().optional().describe("Enable the pedal effect (default true)"),
  }).optional().describe("Expression pedal effect block. Omit to disable."),

  fx1: FxBlockSchema.describe("FX1 slot (pre-amp or first in chain). Omit to leave empty."),
  fx2: FxBlockSchema.describe("FX2 slot. Omit to leave empty."),
  fx3: FxBlockSchema.describe("FX3 slot. Omit to leave empty."),

  ns: z.object({
    threshold: z.number().int().min(0).max(100).describe("Noise threshold 0–100"),
    release: z.number().int().min(0).max(100).describe("Release time 0–100"),
    on: z.boolean().optional().describe("Enable NS (default true)"),
    detect: z.string().optional().describe("Detection point: INPUT or NS INPUT (default INPUT)"),
  }).optional().describe("Noise suppressor. Omit to leave disabled."),

  fv: z.object({
    position: z.number().int().min(0).max(100).describe("Pedal position 0–100"),
    min: z.number().int().min(0).max(100).describe("Minimum volume 0–100"),
    max: z.number().int().min(0).max(100).describe("Maximum volume 0–100"),
    curve: z.string().optional().describe("Response curve: SLOW1, SLOW2, NORMAL, FAST (default NORMAL)"),
  }).optional().describe("Foot volume block. Omit to use defaults."),

  delay: z.object({
    type: z.string().describe(`Delay type (${capabilityItemIds("delay")})`),
    timeMs: z.number().min(1).max(2000).describe("Delay time in milliseconds, 1–2000"),
    feedback: z.number().int().min(0).max(100).describe("Feedback 0–100"),
    level: z.number().int().min(1).max(120).describe("Effect level 1–120"),
    highCut: z.string().optional().describe('High-cut freq (e.g. "2.5kHz", "FLAT")'),
    on: z.boolean().optional().describe("Enable delay (default true)"),
    extra: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe(
      "Extra type-specific params beyond the common ones above (e.g. modRate/modDepth for " +
      "MODULATE, mode/riseTime for TWIST, head for SPACE ECHO). Call describe_device with " +
      "group=delay and the chosen type for the authoritative names, ranges, and string values."
    ),
  }).optional().describe("Delay block. Omit to disable."),

  reverb: z.object({
    type: z.string().describe(`Reverb type (${capabilityItemIds("reverb")})`),
    timeS: z.number().min(0.1).max(10.0).describe("Reverb time in seconds, 0.1–10.0"),
    level: z.number().int().min(1).max(100).describe("Effect level 1–100"),
    preDelay: z.number().min(0).max(200).optional().describe("Pre-delay in ms 0–200 (default 0)"),
    tone: z.number().int().min(-50).max(50).optional().describe("Tone EQ −50–+50 (default 0)"),
    density: z.number().int().min(1).max(10).optional().describe("Density 1–10 (default 5)"),
    direct: z.number().int().min(0).max(100).optional().describe("Direct level 0–100 (default 100)"),
    on: z.boolean().optional().describe("Enable reverb (default true)"),
    extra: z.record(z.string(), z.number()).optional().describe(
      "Extra type-specific params beyond the common ones above (e.g. pitch/pitchLevel for " +
      "SHIMMER, feedback/highCut for SUB DELAY). Call describe_device with group=reverb and " +
      "the chosen type for the authoritative names and ranges."
    ),
  }).optional().describe("Reverb block. Omit to disable."),
});

type GeneratePatchInput = z.infer<typeof inputSchema>;
type Patch = gx1.Patch;

const applyOdds = (patch: Patch, oddsParams: GeneratePatchInput["odds"]): void => {
  if (!oddsParams) { clearOdds(patch); return; }
  odds(patch, oddsParams.type, oddsParams.drive, oddsParams.tone, oddsParams.level, oddsParams.direct, oddsParams.solo, oddsParams.soloLevel);
};

const applyPfx = (patch: Patch, pfxParams: GeneratePatchInput["pfx"]): void => {
  if (!pfxParams) { patch.pfx.on = false; return; }
  pfx(patch, pfxParams.type, pfxParams.params ?? {}, pfxParams.on ?? true);
};

const applyFxSlots = (patch: Patch, params: GeneratePatchInput): void => {
  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    const block = params[slot];
    if (!block?.type || block.type === "NONE") continue;
    fx(patch, slot, block.type, block.subType ?? null, block.params ?? {});
    if (block.on === false) patch[slot].on = false;
  }
};

const applyFv = (patch: Patch, fvParams: GeneratePatchInput["fv"]): void => {
  if (!fvParams) return;
  fv(patch, fvParams.position, fvParams.min, fvParams.max, fvParams.curve);
};

const applyDelay = (patch: Patch, delayParams: GeneratePatchInput["delay"]): void => {
  if (!delayParams) { patch.delay.on = false; return; }
  delay(patch, delayParams.type, delayParams.timeMs, delayParams.feedback, delayParams.level, delayParams.highCut, delayParams.on ?? true, delayParams.extra ?? {});
};

const applyReverb = (patch: Patch, reverbParams: GeneratePatchInput["reverb"]): void => {
  if (!reverbParams) return;
  reverb(patch, reverbParams.type, reverbParams.timeS, reverbParams.level, reverbParams.preDelay, reverbParams.tone, reverbParams.density, reverbParams.direct, reverbParams.on ?? true, reverbParams.extra ?? {});
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

Signal chain: omit it to use the full default order —
  ["PFX","FX1","OD/DS","AMP","NS","FV","FX2","FX3","DLY","REV"]
— or pass just the blocks you care about, in the order you want them relative to each
other (e.g. ["OD/DS","FX1","AMP"] to move OD/DS ahead of FX1). Any block you leave out
is inserted at its default position, so you never have to spell out the whole chain to
change one part of it. "OD" is accepted as shorthand for "OD/DS".

${buildCatalog()}`,
      inputSchema,
    },
    (params) => {
      try {
        const chain = params.chain === undefined ? undefined : normalizeChain(params.chain);
        const patch = basePatch(params.name, chain, params.key);

        const ampParams = params.amp;
        amp(patch, ampParams.type, ampParams.gain, ampParams.bass, ampParams.mid, ampParams.treble, ampParams.speaker, ampParams.mic, ampParams.level, ampParams.solo, ampParams.soloLevel);

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
        const file = patchUtils.upsertPatch(gx1.driver, params.outPath, patch);
        const verb = describeUpsertAction(patchCountBefore, file.patches.length);
        return ok(`${verb} patch "${params.name}" → ${params.outPath} (${file.patches.length} patch(es) total)`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerGeneratePatch };
