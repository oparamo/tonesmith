import { describe, it, expect, afterEach } from "vitest";
import { gx1, capabilityUtils } from "@tonesmith/core";
import type { CapabilityGroup } from "@tonesmith/core";
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

/**
 * Fields on per-type blocks, where one flat schema field serves every type and each type declares
 * its own range. These carry the union of those ranges, never one type's.
 */
const SPANNING_FIELDS: BoundedField[] = [
  { path: "delay.time", groupId: "delay", paramName: "TIME" },
  { path: "delay.feedback", groupId: "delay", paramName: "FEEDBACK" },
  { path: "delay.level", groupId: "delay", paramName: "LEVEL" },
  { path: "reverb.time", groupId: "reverb", paramName: "TIME" },
  { path: "reverb.level", groupId: "reverb", paramName: "LEVEL" },
  { path: "reverb.preDelay", groupId: "reverb", paramName: "PRE-DELAY" },
  { path: "reverb.tone", groupId: "reverb", paramName: "TONE" },
  { path: "reverb.density", groupId: "reverb", paramName: "DENSITY" },
  { path: "reverb.direct", groupId: "reverb", paramName: "DIRECT" },
];

const rangeFor = ({ groupId, paramName }: BoundedField): { min: number; max: number } => {
  const group = capabilityUtils.findGroup(gx1.driver.capabilities, groupId);
  const param = group.params?.find(p => p.name === paramName);
  if (!param) throw new Error(`No ParamSpec "${paramName}" in capabilities group "${groupId}"`);
  if (param.min === undefined || param.max === undefined) {
    throw new Error(`ParamSpec "${paramName}" in group "${groupId}" has no numeric bounds`);
  }
  return { min: param.min, max: param.max };
};

/** Each declaring type's range for a spanning field's param. Types not declaring it are absent. */
const typeRangesFor = ({ groupId, paramName }: BoundedField): { min: number; max: number }[] =>
  capabilityUtils.findGroup(gx1.driver.capabilities, groupId).items.flatMap(item => {
    const param = item.params?.find(p => p.name === paramName);
    if (param?.min === undefined || param.max === undefined) return [];
    return [{ min: param.min, max: param.max }];
  });

const unionRangeFor = (field: BoundedField): { min: number; max: number } => {
  const ranges = typeRangesFor(field);
  if (ranges.length === 0) throw new Error(`No type declares a numeric "${field.paramName}" in "${field.groupId}"`);
  return {
    min: Math.min(...ranges.map(range => range.min)),
    max: Math.max(...ranges.map(range => range.max)),
  };
};

interface JsonSchemaNode {
  minimum?: number;
  maximum?: number;
  description?: string;
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

  /**
   * Bounding a flat field by one representative type rejected other types' valid values before the
   * per-type check ever ran: reverb LEVEL 0 (SHIMMER, TERA ECHO), reverb TIME above 10 (SUB DELAY,
   * whose range is 1-2000 ms), delay LEVEL 0 (SPACE ECHO, SHIMMER, WARP, TWIST) and delay TIME 0
   * (GLITCH) were all unreachable. The union is the only bound that leaves every type's range
   * reachable, and validateTypeParams still enforces the exact one.
   */
  it.each(SPANNING_FIELDS)("$path spans every type's range, not one representative type's", async (field) => {
    const client = await connectClient();
    close = client.close;
    const tool = await client.getToolSchema("generate_gx1_patch") as { inputSchema: JsonSchemaNode };

    const node = nodeAt(patchSpecNode(tool.inputSchema), field.path);
    const { min, max } = unionRangeFor(field);

    expect(node.minimum, `${field.path} should admit the lowest min any type declares`).toBe(min);
    expect(node.maximum, `${field.path} should admit the highest max any type declares`).toBe(max);
  });

  // The bound and the sentence beside it used to be able to disagree: zod enforced the catalog
  // while the text quoted whatever range someone last typed. Both now come from the ParamSpec, and
  // this is what keeps it that way. Field notes ("Defaults to 100.") are appended after the
  // catalog text, so this checks containment rather than equality. Spanning fields are exempt:
  // their span is a union in no single unit, so they state no range at all.
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

  // delay's flat `highCut` field names one representative type's values, which is only sound while
  // every delay type shares the same table.
  it("gives every delay type the same HIGH CUT values, so one representative type can speak for all", () => {
    const delayGroup = capabilityUtils.findGroup(gx1.driver.capabilities, "delay");
    const valuesFor = (typeId: string): string | undefined => {
      const param = capabilityUtils.findItem(delayGroup, typeId).params?.find(spec => spec.name === "HIGH CUT");
      return param?.values?.join(", ");
    };
    const representative = valuesFor("STANDARD");

    expect(representative, "STANDARD should declare HIGH CUT values").toBeDefined();
    for (const item of delayGroup.items) {
      const values = valuesFor(item.id);
      if (values === undefined) continue;
      expect(values, `delay type "${item.id}" HIGH CUT values differ from STANDARD's`).toBe(representative);
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
      for (const block of blocks ?? []) {
        expect(nodeAt(spec, block).properties?.subType, `${block} must accept a subType`).toBeDefined();
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
