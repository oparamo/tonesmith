import { describe, it, expect, afterEach } from "vitest";
import { gx1, capabilityUtils } from "@tonesmith/core";
import { connectClient } from "./helpers";

/**
 * Two drift guards for generate_gx1_patch:
 *
 * 1. Bounds: every numeric schema field derives its min/max from the capabilities
 *    ParamSpec range via boundedNumber(), so the two can no longer hold divergent
 *    numbers — the schema doesn't restate the range, it reads it. What can still go
 *    wrong is the *wiring*: a field left unbounded (boundedNumber not applied), or
 *    pointed at the wrong / a non-numeric param. This guard introspects the actually-
 *    wired tool inputSchema and asserts each field carries a finite bound equal to the
 *    catalog range for the param it's supposed to mirror (a non-numeric range can't
 *    parse, so a mis-mapped enum field would throw at load rather than go unbounded).
 *
 * 2. Type catalog: delay/reverb/pfx `type` fields are plain z.string() (core, not zod,
 *    validates the actual value), so their .describe() text is the only place the valid
 *    values are surfaced to a client. Catches the class of bug where that text is a
 *    hardcoded, complete-looking enumeration that silently goes stale when a new type is
 *    added to constants.ts/capabilities.ts.
 */


interface BoundedField {
  /** Dot path within the generate_gx1_patch inputSchema. */
  path: string;
  groupId: string;
  paramName: string;
  /**
   * For per-type blocks (delay/reverb) whose params live on each type item rather than the
   * group, the representative type whose params the flat generate schema mirrors. Omit for
   * single-shape blocks (amp/odds/ns/fv) that carry their params at the group level.
   */
  typeId?: string;
}

const BOUNDED_FIELDS: BoundedField[] = [
  { path: "amp.gain", groupId: "amp", paramName: "GAIN" },
  { path: "amp.bass", groupId: "amp", paramName: "BASS" },
  { path: "amp.middle", groupId: "amp", paramName: "MIDDLE" },
  { path: "amp.treble", groupId: "amp", paramName: "TREBLE" },
  { path: "amp.level", groupId: "amp", paramName: "LEVEL" },
  { path: "amp.soloLevel", groupId: "amp", paramName: "SOLO LEVEL" },
  { path: "odds.drive", groupId: "odds", paramName: "DRIVE" },
  { path: "odds.tone", groupId: "odds", paramName: "TONE" },
  { path: "odds.level", groupId: "odds", paramName: "LEVEL" },
  { path: "odds.direct", groupId: "odds", paramName: "DIRECT" },
  { path: "odds.soloLevel", groupId: "odds", paramName: "SOLO LEVEL" },
  { path: "ns.threshold", groupId: "ns", paramName: "THRESHOLD" },
  { path: "ns.release", groupId: "ns", paramName: "RELEASE" },
  { path: "fv.position", groupId: "fv", paramName: "POSITION" },
  { path: "fv.min", groupId: "fv", paramName: "MIN" },
  { path: "fv.max", groupId: "fv", paramName: "MAX" },
  { path: "delay.time", groupId: "delay", paramName: "TIME", typeId: "STANDARD" },
  { path: "delay.feedback", groupId: "delay", paramName: "FEEDBACK", typeId: "STANDARD" },
  { path: "delay.level", groupId: "delay", paramName: "LEVEL", typeId: "STANDARD" },
  { path: "reverb.time", groupId: "reverb", paramName: "TIME", typeId: "HALL S" },
  { path: "reverb.level", groupId: "reverb", paramName: "LEVEL", typeId: "HALL S" },
  { path: "reverb.preDelay", groupId: "reverb", paramName: "PRE-DELAY", typeId: "HALL S" },
  { path: "reverb.tone", groupId: "reverb", paramName: "TONE", typeId: "HALL S" },
  { path: "reverb.density", groupId: "reverb", paramName: "DENSITY", typeId: "HALL S" },
  { path: "reverb.direct", groupId: "reverb", paramName: "DIRECT", typeId: "HALL S" },
];

const rangeFor = ({ groupId, paramName, typeId }: BoundedField): { min: number; max: number } => {
  const group = capabilityUtils.findGroup(gx1.driver.capabilities, groupId);
  const params = typeId === undefined
    ? group.params
    : capabilityUtils.findItem(group, typeId).params;
  const param = params?.find(p => p.name === paramName);
  const where = typeId === undefined ? `group "${groupId}"` : `${groupId} type "${typeId}"`;
  if (!param) throw new Error(`No ParamSpec "${paramName}" in capabilities ${where}`);
  if (param.min === undefined || param.max === undefined) {
    throw new Error(`ParamSpec "${paramName}" in ${where} has no numeric bounds`);
  }
  return { min: param.min, max: param.max };
};

interface JsonSchemaNode {
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
}

/**
 * The per-patch spec node: every block lives inside the `patches` array's item schema. Asserting the
 * hop exists doubles as a check that the array shape reaches the client at all.
 */
const patchSpecNode = (root: JsonSchemaNode): JsonSchemaNode => {
  const patches = root.properties?.patches;
  if (!patches?.items) throw new Error("generate_gx1_patch should advertise a `patches` array of patch specs");
  return patches.items;
};

/** Walks a dot-path through a JSON-schema object's nested `properties` to the leaf node. */
const nodeAt = (root: JsonSchemaNode, path: string): JsonSchemaNode => {
  let node = root;
  for (const part of path.split(".")) {
    const next = node.properties?.[part];
    if (!next) throw new Error(`No schema node at "${path}" (missing "${part}")`);
    node = next;
  }
  return node;
};

describe("generate_gx1_patch schema/capabilities bounds drift guard", () => {
  let close: () => Promise<void> = async () => { /* set per test */ };
  afterEach(async () => { await close(); });

  it.each(BOUNDED_FIELDS)("$path derives a finite bound matching its catalog range", async (field) => {
    const client = await connectClient();
    close = client.close;
    const tool = await client.getToolSchema("generate_gx1_patch") as { inputSchema: JsonSchemaNode };

    const node = nodeAt(patchSpecNode(tool.inputSchema), field.path);
    const { min, max } = rangeFor(field);

    expect(node.minimum, `${field.path} should carry a finite min`).toBe(min);
    expect(node.maximum, `${field.path} should carry a finite max`).toBe(max);
  });
});

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

describe("generate_gx1_patch chain worked-example drift guard", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  const chainExampleInput = gx1.CHAIN_EXAMPLE.input;

  it("shows the exact resolution normalizeChain produces for the description's example", async () => {
    const client = await connectClient();
    close = client.close;

    const toolSchema = await client.getToolSchema("generate_gx1_patch") as { description: string };

    expect(toolSchema.description, "the worked chain example must match the real merge rule").toContain(JSON.stringify(chainExampleInput));
    expect(toolSchema.description, "the worked chain example must match the real merge rule").toContain(gx1.CHAIN_EXAMPLE.resolution);
  });

  it("resolves every block of the example, in normalizeChain's order", () => {
    const shown = gx1.CHAIN_EXAMPLE.resolution.split(", ").map(block => block.replace(" (off)", ""));

    expect(shown, "the rendered resolution must be exactly what normalizeChain produces").toEqual(gx1.normalizeChain(chainExampleInput));
  });

  it("uses an example in which an omitted block leaves its default slot", () => {
    const resolved = gx1.normalizeChain(chainExampleInput);
    const omittedBlocksThatMoved = gx1.DEFAULT_CHAIN.filter(
      (block, defaultIndex) => !chainExampleInput.includes(block) && resolved.indexOf(block) !== defaultIndex
    );

    expect(omittedBlocksThatMoved, "a contiguous example would not show that omitted blocks travel with their default predecessor").not.toHaveLength(0);
  });

  it("switches off a block the example orders explicitly, so bypass reads as independent of position", () => {
    const offBlocks = gx1.CHAIN_EXAMPLE.resolution
      .split(", ")
      .filter(block => block.endsWith(" (off)"))
      .map(block => block.replace(" (off)", ""));

    expect(offBlocks, "the example must switch some block off, or it only demonstrates ordering").not.toHaveLength(0);
    for (const block of offBlocks) {
      expect(chainExampleInput, `"${block}" must be ordered explicitly, otherwise the example shows omission and bypass together`).toContain(block);
    }
  });

  it("shows the default order straight from DEFAULT_CHAIN, so it can't drift", async () => {
    const client = await connectClient();
    close = client.close;

    const toolSchema = await client.getToolSchema("generate_gx1_patch") as { description: string };

    expect(toolSchema.description, "the default order shown must come from DEFAULT_CHAIN").toContain(gx1.DEFAULT_CHAIN.join(", "));
  });
});
