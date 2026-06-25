import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gx1 } from "@tonesmith/core";
const { basePatch, amp, odds, clearOdds, fx, ns, delay, reverb, saveTsl } = gx1;
import { FxBlockSchema, ok, err } from "../common/index";

const registerGeneratePatch = (server: McpServer): void => {
  server.registerTool(
    "generate_patch",
    {
      description: `Build a BOSS GX-1 patch from structured parameters and save it as a .tsl file.

Signal chains:
  "FX1>AMP>NS>DLY>REV"        — FX1 before amp (most common)
  "FX1>AMP>FX2>NS>DLY>REV"   — FX1 before amp, FX2 in loop
  "FX1>AMP>NS>REV"            — no delay
  "FX1>OD>AMP>NS>DLY>REV"    — OD/DS in chain
  "FX1>OD>AMP>FX2>NS>DLY>REV"

Amp types: TRNSPRNT NATURAL BOUTIQUE SUPREME MAXIMUM JUGGERNAUT X-CRUNCH X-HI GAIN X-MODDED X-ULTRA X-OPTIMA X-TITAN JC-120 TWIN DELUXE TWEED DIAMOND BRIT STACK RECTI STACK MATCH BG COMBO ORNG STACK BGNR UB
Speaker: OFF ORIGINAL 1x8" 1x10" 1x12" 2x12" 4x10" 4x12" 8x12"
Mic: DYN57 DYN421 CND451 CND87 FLAT RIBON121 BLEND A BLEND B BLEND C
Delay types: STANDARD MODULATE PAN REVERSE ANALOG ANLG MOD SPACE ECHO SHIMMER WARP TWIST GLITCH
Reverb types: HALL S HALL M PLATE ROOM S ROOM L AMBIENCE SPRING SHIMMER SUB DELAY TERA ECHO`,
      inputSchema: {
        name: z.string().max(13).describe("Patch name (max 13 characters)"),
        outPath: z.string().describe("Output file path (e.g. my-tone.tsl)"),
        chain: z.string().optional().describe('Signal chain key (default "FX1>AMP>NS>DLY>REV")'),

        amp: z.object({
          type: z.string().describe("Amplifier model"),
          gain: z.number().int().min(0).max(100).describe("Gain 0–100"),
          bass: z.number().int().min(0).max(100).describe("Bass EQ 0–100 (50=flat)"),
          mid: z.number().int().min(0).max(100).describe("Mid EQ 0–100 (50=flat)"),
          treble: z.number().int().min(0).max(100).describe("Treble EQ 0–100 (50=flat)"),
          speaker: z.string().optional().describe("Cabinet model (default ORIGINAL)"),
          mic: z.string().optional().describe("Microphone model (default DYN57)"),
          level: z.number().int().min(0).max(120).optional().describe("Output level 0–120 (default 100)"),
        }).describe("Amplifier block (required)"),

        odds: z.object({
          type: z.string().describe("OD/DS pedal type (e.g. BLUES OD, CRUNCH, METAL, DIST, FUZZ)"),
          drive: z.number().int().min(0).max(100).describe("Drive 0–100"),
          tone: z.number().int().min(0).max(100).describe("Tone 0–100"),
          level: z.number().int().min(0).max(100).describe("Level 0–100"),
          direct: z.number().int().min(0).max(100).optional().describe("Direct mix 0–100 (default 0)"),
        }).optional().describe("Overdrive/distortion block. Omit to disable."),

        fx1: FxBlockSchema.describe("FX1 slot (pre-amp or first in chain). Omit to leave empty."),
        fx2: FxBlockSchema.describe("FX2 slot. Omit to leave empty."),
        fx3: FxBlockSchema.describe("FX3 slot. Omit to leave empty."),

        ns: z.object({
          threshold: z.number().int().min(0).max(100).describe("Noise threshold 0–100"),
          release: z.number().int().min(0).max(100).describe("Release time 0–100"),
          on: z.boolean().optional().describe("Enable NS (default true)"),
        }).optional().describe("Noise suppressor. Omit to use defaults."),

        delay: z.object({
          type: z.string().describe("Delay type (STANDARD, MODULATE, PAN, REVERSE, ANALOG, ANLG MOD, SPACE ECHO, SHIMMER, WARP, TWIST, GLITCH)"),
          timeMs: z.number().describe("Delay time in milliseconds"),
          feedback: z.number().int().min(0).max(100).describe("Feedback 0–100"),
          level: z.number().int().min(0).max(100).describe("Effect level 0–100"),
          highCut: z.string().optional().describe('High-cut freq (e.g. "2.5kHz", "FLAT")'),
          on: z.boolean().optional().describe("Enable delay (default true)"),
          extra: z.record(z.string(), z.number()).optional().describe(
            "Extra type-specific params (e.g. { mod_rate: 12, mod_depth: 18 } for MODULATE)"
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
            "Extra type-specific params (e.g. { pitch: 12, pitch_lvl: 28 } for SHIMMER)"
          ),
        }).optional().describe("Reverb block. Omit to disable."),
      },
    },
    async (params) => {
      try {
        const p = basePatch(params.name, params.chain);

        const a = params.amp;
        amp(p, a.type, a.gain, a.bass, a.mid, a.treble, a.speaker, a.mic, a.level);

        if (params.odds) {
          const o = params.odds;
          odds(p, o.type, o.drive, o.tone, o.level, o.direct);
        } else {
          clearOdds(p);
        }

        for (const slot of ["fx1", "fx2", "fx3"] as const) {
          const block = params[slot];
          if (block?.type && block.type !== "NONE") {
            fx(p, slot, block.type, block.subtype ?? null, block.params ?? {});
            if (block.on === false) p[slot].on = false;
          }
        }

        if (params.ns) {
          ns(p, params.ns.threshold, params.ns.release, params.ns.on ?? true);
        }

        if (params.delay) {
          const d = params.delay;
          delay(p, d.type, d.timeMs, d.feedback, d.level, d.highCut, d.on ?? true, d.extra ?? {});
        } else {
          p.delay.on = false;
        }

        if (params.reverb) {
          const r = params.reverb;
          reverb(p, r.type, r.timeS, r.level, r.preDelay, r.tone, r.density, r.direct, r.on ?? true, r.extra ?? {});
        }

        saveTsl([p], params.name, params.outPath);
        return ok(`Saved patch "${params.name}" → ${params.outPath}`);
      } catch (e) {
        return err(e);
      }
    }
  );
};

export { registerGeneratePatch };
