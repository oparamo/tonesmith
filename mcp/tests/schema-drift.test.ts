import { describe, it, expect, afterEach } from "vitest";
import { gx1, capabilityUtils } from "@tonesmith/core";
import type { CapabilityGroup, CapabilityItem, ParamSpec } from "@tonesmith/core";
import { connectClient } from "./helpers";
import { describeParam } from "../src/devices/gx1/param-ref";

/**
 * Two drift guards for generate_gx1_patch:
 *
 * 1. Bounds: every numeric schema field derives its min/max from the capabilities
 *    ParamSpec range, so the two can no longer hold divergent numbers, since the schema
 *    doesn't restate the range, it reads it. What can still go wrong is the *wiring*: a
 *    field left unbounded, or pointed at the wrong / a non-numeric param. This guard
 *    introspects the actually-wired tool inputSchema and asserts each field carries a
 *    finite bound equal to the catalog range for the param it's supposed to mirror (a
 *    non-numeric range can't parse, so a mis-mapped enum field would throw at load rather
 *    than go unbounded). Which range that is depends on where the param lives: a
 *    single-shape block's field mirrors its group's range, while a per-type block's flat
 *    field has to admit every type's, so it carries their union.
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
}

/** Fields on single-shape blocks, whose params live on the group and so have one range. */
const GROUP_FIELDS: BoundedField[] = [
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
];

/** Blocks that declare one schema per type, taken from the capability group of the same name. */
const PER_TYPE_BLOCKS = ["pfx", "delay", "reverb"];

const rangeFor = ({ groupId, paramName }: BoundedField): { min: number; max: number } => {
  const group = capabilityUtils.findGroup(gx1.driver.capabilities, groupId);
  const param = group.params?.find(p => p.name === paramName);
  if (!param) throw new Error(`No ParamSpec "${paramName}" in capabilities group "${groupId}"`);
  if (param.min === undefined || param.max === undefined) {
    throw new Error(`ParamSpec "${paramName}" in group "${groupId}" has no numeric bounds`);
  }
  return { min: param.min, max: param.max };
};

interface JsonSchemaNode {
  type?: string;
  const?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  oneOf?: JsonSchemaNode[];
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

  it.each(GROUP_FIELDS)("$path derives a finite bound matching its catalog range", async (field) => {
    const client = await connectClient();
    close = client.close;
    const tool = await client.getToolSchema("generate_gx1_patch") as { inputSchema: JsonSchemaNode };

    const node = nodeAt(patchSpecNode(tool.inputSchema), field.path);
    const { min, max } = rangeFor(field);

    expect(node.minimum, `${field.path} should carry a finite min`).toBe(min);
    expect(node.maximum, `${field.path} should carry a finite max`).toBe(max);
  });

  // A group-level range only speaks for the whole block while no type narrows or widens it. If a
  // type ever declares its own version of one of these params, the field belongs in SPANNING_FIELDS
  // instead, and until it moves, that type's range is the one nobody is enforcing.
  it.each(GROUP_FIELDS)("$path stays a group-level param, with no type declaring its own", (field) => {
    const overriding = capabilityUtils.findGroup(gx1.driver.capabilities, field.groupId).items
      .filter(item => item.params?.some(param => param.name === field.paramName))
      .map(item => item.id);

    expect(overriding, `${field.groupId} types redeclare "${field.paramName}"`).toEqual([]);
  });

  // The bound and the sentence beside it used to be able to disagree: zod enforced the catalog
  // while the text quoted whatever range someone last typed. Both now come from the ParamSpec, and
  // this is what keeps it that way. Field notes ("Defaults to 100.") are appended after the
  // catalog text, so this checks containment rather than equality.
  it.each(GROUP_FIELDS)("$path describes itself from the catalog, not from hand-typed text", async (field) => {
    const client = await connectClient();
    close = client.close;
    const tool = await client.getToolSchema("generate_gx1_patch") as { inputSchema: JsonSchemaNode };

    const node = nodeAt(patchSpecNode(tool.inputSchema), field.path);
    const fromCatalog = describeParam({ group: field.groupId, param: field.paramName });

    expect(node.description, `${field.path} should reach the client described`).toBeDefined();
    expect(node.description).toContain(fromCatalog);
  });
});

/**
 * The schema node a caller fills in for one type: that type's own variant where the block declares
 * one per type, or the block itself where a single schema serves every type (the fx slots).
 */
const nodeForType = (block: JsonSchemaNode, typeId: string): JsonSchemaNode | undefined => {
  if (block.oneOf === undefined) return block;
  return block.oneOf.find(variant => variant.properties?.type.const === typeId);
};

/** Every param a type accepts: its group's shared ones plus its own, keyed as the schema keys them. */
const paramsForType = (group: CapabilityGroup, item: CapabilityItem): ParamSpec[] =>
  [...(group.params ?? []), ...(item.params ?? [])].filter(spec => spec.key !== undefined);

/** What one param's field should look like, read from the ParamSpec rather than restated. */
const expectFieldMatchesSpec = (field: JsonSchemaNode | undefined, spec: ParamSpec, label: string): void => {
  expect(field, `${label} should declare "${spec.key}"`).toBeDefined();
  if (spec.boolean === true) {
    expect(field?.type, `${label} "${spec.key}" should take a boolean`).toBe("boolean");
    return;
  }
  if (spec.values !== undefined) {
    expect(field?.enum, `${label} "${spec.key}" should list the catalog's values`).toEqual([...spec.values]);
    return;
  }
  expect(field?.minimum, `${label} "${spec.key}" should carry this type's own min`).toBe(spec.min);
  expect(field?.maximum, `${label} "${spec.key}" should carry this type's own max`).toBe(spec.max);
};

describe("generate_gx1_patch per-type variant drift guard", () => {
  let close: () => Promise<void> = async () => { /* set per test */ };
  afterEach(async () => { await close(); });

  /**
   * One flat field serving every type could only carry the union of their ranges, which put valid
   * values out of reach until PR #42 widened them: reverb LEVEL 0 on SHIMMER, reverb TIME above 10
   * on SUB DELAY, delay TIME 0 on GLITCH. A variant per type is what makes the declared bound the
   * enforced one, and this is the guard that keeps each variant reading off its own ParamSpec.
   */
  it.each(PER_TYPE_BLOCKS)("%s declares one variant per type, carrying that type's own params", async (groupId) => {
    const client = await connectClient();
    close = client.close;
    const tool = await client.getToolSchema("generate_gx1_patch") as { inputSchema: JsonSchemaNode };
    const block = nodeAt(patchSpecNode(tool.inputSchema), groupId);
    const group = capabilityUtils.findGroup(gx1.driver.capabilities, groupId);

    for (const item of group.items) {
      const variant = nodeForType(block, item.id);
      expect(variant, `${groupId} should declare a variant for type "${item.id}"`).toBeDefined();

      const params = paramsForType(group, item);
      const declared = Object.keys(variant?.properties ?? {}).sort();
      const hasSubTypes = item.subTypes !== undefined && item.subTypes.length > 0;
      const subTypeField = hasSubTypes ? ["subType"] : [];
      const expected = [...params.map(spec => spec.key ?? ""), "type", "on", ...subTypeField].sort();

      expect(declared, `${groupId} ${item.id} should declare exactly its own params`).toEqual(expected);
      for (const spec of params) {
        expectFieldMatchesSpec(variant?.properties?.[spec.key ?? ""], spec, `${groupId} ${item.id}`);
      }
    }
  });

  // A variant states its bounds and leaves the prose to describe_device, which works while the key
  // spells the control. It doesn't for the few the device labels differently: nothing in
  // `spreadTime` says the panel reads S-TIME, and the parameter guide only ever says S-TIME.
  it.each(PER_TYPE_BLOCKS)("%s glosses a field whose key doesn't spell the device's own label", async (groupId) => {
    const client = await connectClient();
    close = client.close;
    const tool = await client.getToolSchema("generate_gx1_patch") as { inputSchema: JsonSchemaNode };
    const block = nodeAt(patchSpecNode(tool.inputSchema), groupId);
    const group = capabilityUtils.findGroup(gx1.driver.capabilities, groupId);

    const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const item of group.items) {
      const renamed = paramsForType(group, item).filter(spec => normalize(spec.name) !== normalize(spec.key ?? ""));
      for (const spec of renamed) {
        const field = nodeForType(block, item.id)?.properties?.[spec.key ?? ""];
        expect(field?.description, `${groupId} ${item.id} "${spec.key}" should say the device calls it ${spec.name}`)
          .toContain(spec.name);
      }
    }
  });
});

describe("generate_gx1_patch schema/capabilities type-catalog drift guard", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  // Every block whose `type`-ish fields take a fixed, type-independent set names that set in its
  // own description. Dropping one costs a describe_device round trip per patch, measured, not
  // theoretical: removing the amp/cab/mic lists sent arms back for a second lookup to rediscover
  // ids they had previously been handed.
  const ID_LIST_GROUPS = ["amp", "cab", "mic", "odds", "fx", "delay", "reverb", "pfx"];

  it("mentions every current type id of every id-listing group in the tool's client-visible schema", async () => {
    const client = await connectClient();
    close = client.close;

    const toolSchema = await client.getToolSchema("generate_gx1_patch");
    const toolSchemaText = JSON.stringify(toolSchema);

    for (const groupId of ID_LIST_GROUPS) {
      const typeIds = capabilityUtils.findGroup(gx1.driver.capabilities, groupId).items.map(item => item.id);
      for (const typeId of typeIds) {
        // Cab ids carry a literal inch mark (1x8"), which JSON-escapes inside the serialized schema, so
        // so the needle has to be escaped the same way the haystack was.
        const escaped = JSON.stringify(typeId).slice(1, -1);
        expect(toolSchemaText, `expected the tool schema to mention ${groupId} type "${typeId}"`).toContain(escaped);
      }
    }
  });

});

/**
 * Which generate-schema blocks each capability group feeds. cab and mic are left out deliberately:
 * they reach the schema as amp's `speaker`/`mic` strings, which have no room for a variant, so a
 * subType turning up on one of them is a gap to fail on rather than a mapping to add.
 */
const GROUP_BLOCKS: Partial<Record<string, string[]>> = {
  amp: ["amp"],
  odds: ["odds"],
  pfx: ["pfx"],
  fx: ["fx1", "fx2", "fx3"],
  ns: ["ns"],
  fv: ["fv"],
  delay: ["delay"],
  reverb: ["reverb"],
};

/** Every capability group with at least one item offering a variant to choose. */
const groupsDeclaringSubTypes = (): CapabilityGroup[] =>
  gx1.driver.capabilities.groups.filter(
    group => group.items.some(item => item.subTypes !== undefined && item.subTypes.length > 0)
  );

describe("generate_gx1_patch subType reachability drift guard", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  // capabilities advertised WAH's six pedal models as subTypes while the pfx block had no field to
  // receive one, so the only way to select a model was a params key capabilities never mentions. A
  // variant a caller can read about but not set is worse than one that doesn't exist: it reads as
  // available, and the patch that tries it saves at the default.
  it("gives every group declaring subTypes a schema field that accepts one", async () => {
    const client = await connectClient();
    close = client.close;
    const tool = await client.getToolSchema("generate_gx1_patch") as { inputSchema: JsonSchemaNode };
    const spec = patchSpecNode(tool.inputSchema);

    for (const group of groupsDeclaringSubTypes()) {
      const blocks = GROUP_BLOCKS[group.id];
      expect(blocks, `group "${group.id}" declares subTypes but feeds no generate-schema block`).toBeDefined();
      const withVariants = group.items.filter(item => item.subTypes !== undefined && item.subTypes.length > 0);

      for (const block of blocks ?? []) {
        for (const item of withVariants) {
          const node = nodeForType(nodeAt(spec, block), item.id);
          expect(node?.properties?.subType, `${block} must accept a subType for "${item.id}"`).toBeDefined();
        }
      }
    }
  });
});

describe("generate_gx1_patch chain drift guard", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("shows the default order straight from DEFAULT_CHAIN, so it can't drift", async () => {
    const client = await connectClient();
    close = client.close;

    const toolSchema = await client.getToolSchema("generate_gx1_patch") as { description: string };

    expect(toolSchema.description, "the default order shown must come from DEFAULT_CHAIN").toContain(gx1.DEFAULT_CHAIN.join(", "));
  });
});
