import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { gx1, capabilityUtils } from "@tonesmith/core";
import { connectClient, emptyTempDir } from "./helpers";

/**
 * Two drift guards for generate_gx1_patch:
 *
 * 1. Bounds: the zod schema's numeric min/max must match the capabilities ParamSpec
 *    ranges they're supposed to mirror, for every top-level (non-record) numeric field.
 *    Catches the class of bug where the MCP schema's bounds silently drifted from the
 *    device reality documented in capabilities.ts (e.g. odds.tone allowing 0-100 instead
 *    of the real -50-+50, or reverb.tone described as +/-12 instead of the real +/-50).
 *
 * 2. Type catalog: delay/reverb/pfx `type` fields are plain z.string() (core, not zod,
 *    validates the actual value), so their .describe() text is the only place the valid
 *    values are surfaced to a client. Catches the class of bug where that text is a
 *    hardcoded, complete-looking enumeration that silently goes stale when a new type is
 *    added to constants.ts/capabilities.ts.
 */

const parseRange = (range: string): { min: number; max: number } => {
  const match = /(-?\d+(?:\.\d+)?)-\+?(-?\d+(?:\.\d+)?)/.exec(range);
  if (!match) throw new Error(`Could not parse range: "${range}"`);
  return { min: Number(match[1]), max: Number(match[2]) };
};

interface BoundedField {
  /** Dot path within the generate_gx1_patch input to override. */
  path: string;
  groupId: string;
  paramName: string;
}

const BOUNDED_FIELDS: BoundedField[] = [
  { path: "amp.gain", groupId: "amp", paramName: "GAIN" },
  { path: "amp.bass", groupId: "amp", paramName: "BASS" },
  { path: "amp.mid", groupId: "amp", paramName: "MIDDLE" },
  { path: "amp.treble", groupId: "amp", paramName: "TREBLE" },
  { path: "amp.level", groupId: "amp", paramName: "LEVEL" },
  { path: "odds.drive", groupId: "odds", paramName: "DRIVE" },
  { path: "odds.tone", groupId: "odds", paramName: "TONE" },
  { path: "odds.level", groupId: "odds", paramName: "LEVEL" },
  { path: "ns.threshold", groupId: "ns", paramName: "THRESHOLD" },
  { path: "ns.release", groupId: "ns", paramName: "RELEASE" },
  { path: "fv.position", groupId: "fv", paramName: "POSITION" },
  { path: "delay.feedback", groupId: "delay", paramName: "FEEDBACK" },
  { path: "delay.level", groupId: "delay", paramName: "LEVEL" },
  { path: "delay.timeMs", groupId: "delay", paramName: "TIME" },
  { path: "reverb.level", groupId: "reverb", paramName: "LEVEL" },
  { path: "reverb.preDelay", groupId: "reverb", paramName: "PRE-DELAY" },
  { path: "reverb.tone", groupId: "reverb", paramName: "TONE" },
  { path: "reverb.density", groupId: "reverb", paramName: "DENSITY" },
  { path: "reverb.direct", groupId: "reverb", paramName: "DIRECT" },
  { path: "reverb.timeS", groupId: "reverb", paramName: "TIME" },
];

const rangeFor = (groupId: string, paramName: string): { min: number; max: number } => {
  const group = capabilityUtils.findGroup(gx1.driver.capabilities, groupId);
  const param = group.params?.find(p => p.name === paramName);
  if (!param) throw new Error(`No ParamSpec "${paramName}" in capabilities group "${groupId}"`);
  return parseRange(param.range);
};

/** Deep-clones `base` and sets a dot-path field to `value`. */
const withOverride = (base: Record<string, unknown>, path: string, value: number): Record<string, unknown> => {
  const clone = structuredClone(base);
  const parts = path.split(".");
  let target = clone;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts[parts.length - 1]] = value;
  return clone;
};

describe("generate_gx1_patch schema/capabilities type-catalog drift guard", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("mentions every current delay/reverb/pfx type id in the tool's client-visible schema", async () => {
    const client = await connectClient();
    close = client.close;

    const toolSchema = await client.getToolSchema("generate_gx1_patch");
    const toolSchemaText = JSON.stringify(toolSchema);

    const delayTypeIds = capabilityUtils.findGroup(gx1.driver.capabilities, "delay").items.map(item => item.id);
    const reverbTypeIds = capabilityUtils.findGroup(gx1.driver.capabilities, "reverb").items.map(item => item.id);
    const pfxTypeIds = capabilityUtils.findGroup(gx1.driver.capabilities, "pfx").items.map(item => item.id);
    const allTypeIds = [...delayTypeIds, ...reverbTypeIds, ...pfxTypeIds];

    for (const typeId of allTypeIds) {
      expect(toolSchemaText, `expected the tool schema to mention delay/reverb/pfx type "${typeId}"`).toContain(typeId);
    }
  });
});

describe("generate_gx1_patch schema/capabilities bounds drift guard", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof emptyTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("accepts every field's documented min/max and rejects just outside them", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;

    const basePatchSpec = {
      name: "Bounds",
      outPath: join(temp.dir, "bounds.tsl"),
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      odds: { type: "BLUES OD", drive: 40, tone: 0, level: 70 },
      ns: { threshold: 20, release: 20 },
      fv: { position: 100, min: 0, max: 100 },
      delay: { type: "STANDARD", timeMs: 500, feedback: 20, level: 25 },
      reverb: { type: "HALL S", timeS: 2.4, level: 20 },
    };

    for (const field of BOUNDED_FIELDS) {
      const { min, max } = rangeFor(field.groupId, field.paramName);

      const atMin = await client.callTool("generate_gx1_patch", withOverride(basePatchSpec, field.path, min));
      expect(atMin.isError, `${field.path}=${min} (documented min) should be accepted: ${atMin.text}`).toBe(false);

      const atMax = await client.callTool("generate_gx1_patch", withOverride(basePatchSpec, field.path, max));
      expect(atMax.isError, `${field.path}=${max} (documented max) should be accepted: ${atMax.text}`).toBe(false);

      const belowMin = await client.callTool("generate_gx1_patch", withOverride(basePatchSpec, field.path, min - 1));
      expect(belowMin.isError, `${field.path}=${min - 1} (below documented min) should be rejected`).toBe(true);

      const aboveMax = await client.callTool("generate_gx1_patch", withOverride(basePatchSpec, field.path, max + 1));
      expect(aboveMax.isError, `${field.path}=${max + 1} (above documented max) should be rejected`).toBe(true);
    }
  });
});
