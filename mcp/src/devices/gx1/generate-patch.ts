import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";
const { basePatch, amp, odds, clearOdds, fx, ns, fv, pfx, delay, reverb, saveTsl } = gx1;
import { ok, err } from "../../common";
import { FxBlockSchema } from "./schemas";

/** Parses a ">"-delimited chain key (e.g. "FX1>OD>AMP>NS>DLY>REV") into node names. */
const parseChain = (chain: string | undefined): string[] | undefined =>
  chain?.split(">").map(node => (node.trim() === "OD" ? "OD/DS" : node.trim()));

/** Builds the type-catalog block of the tool description straight from gx1 capabilities, so it can't drift from constants.ts. */
const buildCatalog = (): string => {
  const caps = gx1.driver.capabilities;
  const itemIds = (groupId: string): string =>
    capabilityUtils.findGroup(caps, groupId).items.map(item => item.id).join(" ");
  const paramRange = (groupId: string, paramName: string): string =>
    capabilityUtils.findGroup(caps, groupId).params?.find(param => param.name === paramName)?.range ?? "";

  const pfxGroup = capabilityUtils.findGroup(caps, "pfx");
  const pfxItems = pfxGroup.items;
  const wahItem = capabilityUtils.findItem(pfxGroup, "WAH");
  const wahSubTypes = wahItem.subTypes?.map(subType => subType.id).join(" ") ?? "";

  return `Amp types: ${itemIds("amp")}
Speaker: ${itemIds("cab")}
Mic: ${itemIds("mic")}
Delay types: ${itemIds("delay")}
Reverb types: ${itemIds("reverb")}
Pedal FX types: ${pfxItems.map(item => item.id).join(", ")}
Wah types: ${wahSubTypes}
NS detect points: ${paramRange("ns", "DETECT")}
FV curves: ${paramRange("fv", "CURVE")}`;
};

const inputSchema = z.object({
  name: z.string().max(13).describe("Patch name (max 13 characters)"),
  outPath: z.string().describe("Output file path (e.g. my-tone.tsl)"),
  chain: z.string().optional().describe('Signal chain key (default "FX1>AMP>NS>DLY>REV")'),
  key: z.string().optional().describe(
    "Song key for HARMONIST's diatonic intervals: C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B (default C)"
  ),

  amp: z.object({
    type: z.string().describe("Amplifier model"),
    gain: z.number().int().min(0).max(100).describe("Gain 0–100"),
    bass: z.number().int().min(0).max(100).describe("Bass EQ 0–100 (50=flat)"),
    mid: z.number().int().min(0).max(100).describe("Mid EQ 0–100 (50=flat)"),
    treble: z.number().int().min(0).max(100).describe("Treble EQ 0–100 (50=flat)"),
    speaker: z.string().optional().describe("Cabinet model (default ORIGINAL)"),
    mic: z.string().optional().describe("Microphone model (default DYN57)"),
    level: z.number().int().min(0).max(120).optional().describe("Output level 0–120 (default 100)"),
    solo: z.boolean().optional().describe("Enable the solo level boost (default false)"),
    soloLevel: z.number().int().min(0).max(100).optional().describe("Output level while solo is engaged, 0–100 (default 50)"),
  }).describe("Amplifier block (required)"),

  odds: z.object({
    type: z.string().describe("OD/DS pedal type (e.g. BLUES OD, CRUNCH, METAL, DIST, FUZZ)"),
    drive: z.number().int().min(0).max(100).describe("Drive 0–100"),
    tone: z.number().int().min(0).max(100).describe("Tone 0–100"),
    level: z.number().int().min(0).max(100).describe("Level 0–100"),
    direct: z.number().int().min(0).max(100).optional().describe("Direct mix 0–100 (default 0)"),
    solo: z.boolean().optional().describe("Enable the solo level boost (default false)"),
    soloLevel: z.number().int().min(0).max(100).optional().describe("Output level while solo is engaged, 0–100 (default 50)"),
  }).optional().describe("Overdrive/distortion block. Omit to disable."),

  pfx: z.object({
    type: z.string().describe("Pedal FX type: WAH or PEDAL BEND"),
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
  }).optional().describe("Noise suppressor. Omit to use defaults."),

  fv: z.object({
    position: z.number().int().min(0).max(100).describe("Pedal position 0–100"),
    min: z.number().int().min(0).max(100).describe("Minimum volume 0–100"),
    max: z.number().int().min(0).max(100).describe("Maximum volume 0–100"),
    curve: z.string().optional().describe("Response curve: SLOW1, SLOW2, NORMAL, FAST (default NORMAL)"),
  }).optional().describe("Foot volume block. Omit to use defaults."),

  delay: z.object({
    type: z.string().describe("Delay type (STANDARD, MODULATE, PAN, REVERSE, ANALOG, ANLG MOD, SPACE ECHO, SHIMMER, WARP, TWIST, GLITCH)"),
    timeMs: z.number().describe("Delay time in milliseconds"),
    feedback: z.number().int().min(0).max(100).describe("Feedback 0–100"),
    level: z.number().int().min(0).max(100).describe("Effect level 0–100"),
    highCut: z.string().optional().describe('High-cut freq (e.g. "2.5kHz", "FLAT")'),
    on: z.boolean().optional().describe("Enable delay (default true)"),
    extra: z.record(z.string(), z.union([z.string(), z.number()])).optional().describe(
      "Extra type-specific params (e.g. { modRate: 12, modDepth: 18 } for MODULATE; " +
      "{ mode: \"TAPE\" } for TWIST; { head: \"1+2\" } for SPACE ECHO)"
    ),
  }).optional().describe("Delay block. Omit to disable."),

  reverb: z.object({
    type: z.string().describe("Reverb type (HALL S, HALL M, PLATE, ROOM S, ROOM L, AMBIENCE, SPRING, SHIMMER, SUB DELAY, TERA ECHO)"),
    timeS: z.number().describe("Reverb time in seconds"),
    level: z.number().int().min(0).max(100).describe("Effect level 0–100"),
    preDelay: z.number().optional().describe("Pre-delay in ms 0–100 (default 0)"),
    tone: z.number().int().optional().describe("Tone EQ −12 to +12 (default 0)"),
    density: z.number().int().optional().describe("Density 1–10 (default 5)"),
    direct: z.number().int().optional().describe("Direct level 0–100 (default 100)"),
    on: z.boolean().optional().describe("Enable reverb (default true)"),
    extra: z.record(z.string(), z.number()).optional().describe(
      "Extra type-specific params (e.g. { pitch: 12 } for SHIMMER)"
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

const registerGeneratePatch = (server: McpServer): void => {
  server.registerTool(
    "generate_gx1_patch",
    {
      description: `Build a BOSS GX-1 patch from structured parameters and save it as a .tsl file.

Signal chains:
  "FX1>AMP>NS>DLY>REV"        — FX1 before amp (most common)
  "FX1>AMP>FX2>NS>DLY>REV"   — FX1 before amp, FX2 in loop
  "FX1>AMP>NS>REV"            — no delay
  "FX1>OD>AMP>NS>DLY>REV"    — OD/DS in chain
  "FX1>OD>AMP>FX2>NS>DLY>REV"

${buildCatalog()}`,
      inputSchema,
    },
    (params) => {
      try {
        const patch = basePatch(params.name, parseChain(params.chain), params.key);

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

        saveTsl([patch], params.name, params.outPath);
        return ok(`Saved patch "${params.name}" → ${params.outPath}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerGeneratePatch };
