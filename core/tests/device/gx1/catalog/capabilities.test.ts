/**
 * Drift guards: the catalog (authored from the parameter guide), the codec field maps (authored
 * from the byte layout) and the decoded types are three independently authored views of one
 * device, and these keep them in step. A new effect type or codec field the catalog lacks fails
 * the suite.
 */
import { describe, it, expect } from "vitest";
import {
  FX_TYPES, AMP_TYPES, SP_TYPES, MIC_TYPES, ODDS_TYPES, DLY_TYPES, REV_TYPES, PFX_TYPES,
  FX_DLY_TYPES, FX_REV_TYPES,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, CHORUS_TYPES, VIBE_MODES, HUM_MODES, WAH_TYPES,
  PARAM_SUBTYPE_EFFECTS, NAME_BYTES, SUB_TYPE_FIELD, DEFAULT_CHAIN,
  BLOCK_GROUPS, BLOCK_NAMES, BLOCK_LABELS,
} from "../../../../src/device/gx1/model";
import type { BlockName } from "../../../../src/device/gx1/model";
import { DEFAULTS_BY_TYPE } from "../../../../src/device/gx1/catalog/defaults";
import { gx1Capabilities } from "../../../../src/device/gx1/catalog/capabilities";
import { blankPatch } from "../../../../src/device/gx1/format/tsl";
import { PARAMS_BY_TYPE, PARAMS_BY_BLOCK, FIELD_LABEL_ALIASES } from "../../../../src/device/gx1/catalog/paramCatalog";
import { FX_PARAM_MAPS, FX_DELAY_TYPE_MAPS } from "../../../../src/device/gx1/format/codec/fxParams";
import {
  PFX_TYPE_MAPS, DELAY_TYPE_MAPS, PATCH_SETTING_FIELDS, fieldsFor,
} from "../../../../src/device/gx1/format/codec/blocks";
import type { CapabilityType, ParamSpec, PatchSpecExample } from "../../../../src/model";
import type { FieldCodec } from "../../../../src/device/gx1/format/codec/fields";
import { present } from "../../../helpers";

const groupTypes = (groupId: string): CapabilityType[] =>
  gx1Capabilities.groups.find(group => group.id === groupId)?.types ?? [];

// Normalizes a param/field name for comparison: lowercase, strip anything that isn't a
// letter or digit, so "PRE-DELAY" (catalog) and "preDelay" (codec) match.
const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const catalogParamNames = (params: readonly ParamSpec[] | undefined): Set<string> =>
  new Set((params ?? []).map(param => normalize(param.name)));

interface PerTypeBlock {
  /** capabilities/catalog block id. */
  block: "fx" | "pedalFx" | "delay" | "reverb" | "fxDelay";
  /** Authoritative codec type list, from model/constants.ts. */
  types: readonly string[];
  /** The type's codec field map, undefined where the codec has none. */
  codecFields: (type: string) => readonly FieldCodec[] | undefined;
  /** codec field names to skip in the reverse (codec → catalog) check: sub-model selectors. */
  reverseSkip: ReadonlySet<string>;
  /** per-type alias map: codec field name → the catalog param label it corresponds to. */
  aliases: Record<string, Record<string, string>>;
  /** per-type catalog params that have no codec field, for a documented reason. */
  paramOnly: Record<string, ReadonlySet<string>>;
}

const PER_TYPE_BLOCKS: PerTypeBlock[] = [
  {
    block: "fx",
    types: FX_TYPES,
    codecFields: (type) => FX_PARAM_MAPS[type],
    reverseSkip: new Set([SUB_TYPE_FIELD]),
    aliases: FIELD_LABEL_ALIASES.fx,
    paramOnly: {
      // KEY is the patch's global key (Patch.key), not a per-effect param.
      "HARMONIST": new Set(["KEY"]),
    },
  },
  {
    block: "pedalFx",
    types: PFX_TYPES,
    codecFields: (type) => PFX_TYPE_MAPS[type],
    reverseSkip: new Set([SUB_TYPE_FIELD]),
    aliases: FIELD_LABEL_ALIASES.pedalFx,
    paramOnly: {},
  },
  {
    block: "delay",
    types: DLY_TYPES,
    codecFields: (type) => DELAY_TYPE_MAPS[type],
    reverseSkip: new Set(),
    aliases: FIELD_LABEL_ALIASES.delay,
    paramOnly: {},
  },
  {
    block: "reverb",
    types: REV_TYPES,
    // fieldsFor("reverb", type) is blocks.ts's own reverbFields, so this reads the codec's real
    // routing (the seven standard types sharing one list) instead of a second copy of it.
    codecFields: (type) => fieldsFor("reverb", type),
    reverseSkip: new Set(),
    aliases: FIELD_LABEL_ALIASES.reverb,
    paramOnly: {},
  },
];

// The FX-slot DELAY is the one fx type modeled per-sub-algorithm (like the dedicated delay
// block). It isn't a top-level capability group; it lives as the subTypes of the fx DELAY
// type, so it gets its own coverage check below rather than joining PER_TYPE_BLOCKS.
const FX_DELAY_BLOCK: PerTypeBlock = {
  block: "fxDelay",
  types: FX_DLY_TYPES,
  codecFields: (type) => FX_DELAY_TYPE_MAPS[type],
  reverseSkip: new Set([SUB_TYPE_FIELD]),
  aliases: FIELD_LABEL_ALIASES.fxDelay,
  paramOnly: {},
};

describe("GX-1 catalog id coverage", () => {
  it.each(PER_TYPE_BLOCKS)("$block: catalog keys match the codec's types", ({ block, types }) => {
    const catalogTypes = new Set(Object.keys(PARAMS_BY_TYPE[block]));

    expect(catalogTypes).toStrictEqual(new Set(types));
  });

  it.each(PER_TYPE_BLOCKS)("$block: capability type ids match the codec's types", ({ block, types }) => {
    const capabilityTypes = new Set(groupTypes(block).map(capType => capType.id));

    expect(capabilityTypes).toStrictEqual(new Set(types));
  });

  it("fxDelay: catalog keys match the codec's sub-algorithms", () => {
    const catalogTypes = new Set(Object.keys(PARAMS_BY_TYPE.fxDelay));

    expect(catalogTypes).toStrictEqual(new Set(FX_DLY_TYPES));
  });

  it("fxDelay: the fx DELAY type's subTypes match the codec's sub-algorithms", () => {
    const fxDelayType = groupTypes("fx").find(capType => capType.id === "DELAY");
    const subTypeIds = new Set((fxDelayType?.subTypes ?? []).map(subType => subType.id));

    expect(subTypeIds).toStrictEqual(new Set(FX_DLY_TYPES));
  });

  // Selection-only / metadata-only blocks: capabilities must list every codec model id.
  it.each([
    { block: "amp", types: AMP_TYPES },
    { block: "cab", types: SP_TYPES },
    { block: "mic", types: MIC_TYPES },
    { block: "drive", types: ODDS_TYPES },
  ])("$block: capabilities lists every codec model id", ({ block, types }) => {
    const capabilityIds = groupTypes(block).map(capType => capType.id);

    expect(capabilityIds).toStrictEqual(expect.arrayContaining([...types]));
  });

  it("the drive group's types equal the fx OD/DS type's subTypes", () => {
    const driveTypeIds = groupTypes("drive").map(capType => capType.id);
    const oddsSubTypeIds = groupTypes("fx").find(capType => capType.id === "OD/DS")?.subTypes?.map(sub => sub.id);

    expect(driveTypeIds).toStrictEqual(oddsSubTypeIds);
  });
});

interface ParityCase {
  title: string;
  catalogOnly: string[];
  codecOnly: string[];
}

const parityCase = (block: PerTypeBlock, type: string): ParityCase => {
  const fields = block.codecFields(type) ?? [];
  const codecNames = new Set(fields.map(field => normalize(field.name)));
  const catalog = present(PARAMS_BY_TYPE[block.block][type], `the ${block.block} ${type} catalog`);
  const catalogNames = catalogParamNames(catalog);
  const aliases = block.aliases[type] ?? {};
  const aliasTargets = new Set(Object.values(aliases).map(normalize));
  const paramOnly = block.paramOnly[type] ?? new Set<string>();

  const catalogOnly = catalog
    .filter(param =>
      !codecNames.has(normalize(param.name)) && !aliasTargets.has(normalize(param.name)) && !paramOnly.has(param.name))
    .map(param => param.name);

  const codecOnly = fields
    .filter(field => !block.reverseSkip.has(field.name))
    .filter(field => !catalogNames.has(normalize(field.name)) && !(field.name in aliases))
    .map(field => field.name);

  return { title: `${block.block} ${type}`, catalogOnly, codecOnly };
};

const parityCases = [...PER_TYPE_BLOCKS, FX_DELAY_BLOCK].flatMap(
  block => block.types.map(type => parityCase(block, type))
);

describe("GX-1 codec <-> catalog param parity", () => {
  it.each(parityCases)("$title: every catalog param has a matching codec field", ({ catalogOnly }) => {
    expect(catalogOnly).toStrictEqual([]);
  });

  it.each(parityCases)("$title: every codec field has a matching catalog param", ({ codecOnly }) => {
    expect(codecOnly).toStrictEqual([]);
  });

  it("every FIELD_LABEL_ALIASES key names a codec field of that type", () => {
    const offending = PER_TYPE_BLOCKS.flatMap(block =>
      Object.entries(FIELD_LABEL_ALIASES[block.block]).flatMap(([type, aliasMap]) => {
        const fieldNames = new Set((block.codecFields(type) ?? []).map(field => field.name));
        return Object.keys(aliasMap)
          .filter(fieldName => !fieldNames.has(fieldName))
          .map(fieldName => `${block.block}/${type}/${fieldName}`);
      })
    );

    expect(offending).toStrictEqual([]);
  });
});

// amp/odds/ns/fv are fixed-shape blocks with one param list rather than one per type, so
// `fieldsFor` (the codec's own single source for a block's field list) stands in for the
// per-type codec map above.
const SINGLE_SHAPE_BLOCKS = ["amp", "drive", "noiseGate", "volume"] as const;

describe("GX-1 codec <-> catalog param parity (single-shape blocks)", () => {
  it.each(SINGLE_SHAPE_BLOCKS)("%s: codec fields match its catalog params", (block) => {
    const codecNames = new Set((fieldsFor(block) ?? []).map(field => normalize(field.name)));
    const catalogNames = catalogParamNames(PARAMS_BY_BLOCK[block]);

    expect(codecNames).toStrictEqual(catalogNames);
  });

  // Every key capabilities stamps on a single-shape block's params has to be a field its decoder
  // actually emits, or a write naming that key lands nowhere.
  it.each(SINGLE_SHAPE_BLOCKS)("%s: every capability param key names a field its decoder emits", (block) => {
    const fields = (fieldsFor(block) ?? []).map(field => field.name);
    const group = present(gx1Capabilities.groups.find(candidate => candidate.id === block), block);
    const keys = (group.params ?? []).map(param => param.key);

    expect(fields).toStrictEqual(expect.arrayContaining(keys));
  });
});

// The name-parity guards above match field/param NAMES only. This guard is auto-derived over
// every per-type codec field and asserts its *representation* agrees with the catalog's authored
// kind: a boolean toggle is a `bool` field; a discrete param is a `lookup` whose table equals its
// `values` verbatim; a numeric one is a numeric field; a param that takes a number or a note value
// is a `namedAbove` field whose note list is those same `values`. It catches a catalog enum backed
// by a hand-rolled numeric codec (PHASER `stage` as a raw index instead of a lookup is that shape
// of bug) and the trigger/solo drift between strings, numbers, and booleans, all without a
// hand-maintained list, so a new effect/field can't silently reintroduce the class. `indexTable`
// fields are left out of the case table below, since their mixed string/number table answers to no
// single kind.

const NUMERIC_KINDS = new Set(["u8", "signed", "scaled", "nibblePair", "nibbleQuad"]);

type ReprClass = ParamSpec["kind"] | "unknown";

const codecClass = (field: FieldCodec): ReprClass => {
  if (field.kind === "bool") return "boolean";
  if (field.kind === "lookup") return "discrete";
  if (field.kind === "namedAbove") return "numericOrNamed";
  const cls: ReprClass = NUMERIC_KINDS.has(field.kind) ? "numeric" : "unknown";
  return cls;
};

interface RepresentationCase {
  title: string;
  field: FieldCodec;
  param: ParamSpec;
}

const representationCases: RepresentationCase[] = [...PER_TYPE_BLOCKS, FX_DELAY_BLOCK].flatMap(block =>
  block.types.flatMap(type => {
    const aliases = block.aliases[type] ?? {};
    const catalog = present(PARAMS_BY_TYPE[block.block][type], `the ${block.block} ${type} catalog`);
    return (block.codecFields(type) ?? [])
      .filter(field => !block.reverseSkip.has(field.name) && field.kind !== "indexTable")
      .map(field => {
        const catalogLabel = aliases[field.name] ?? field.name;
        const param = catalog.find(candidate => normalize(candidate.name) === normalize(catalogLabel));
        return { title: `${block.block} ${type}.${field.name}`, field, param };
      })
      .filter((entry): entry is RepresentationCase => entry.param !== undefined);
  })
);

const tableCases = representationCases.filter(({ param }) => param.kind === "discrete" || param.kind === "numericOrNamed");

describe("GX-1 codec <-> catalog representation parity", () => {
  it.each(representationCases)("$title kind matches", ({ field, param }) => {
    expect(codecClass(field)).toBe(param.kind);
  });

  it.each(tableCases)("$title table equals values", ({ field, param }) => {
    const values = param.kind === "discrete" || param.kind === "numericOrNamed" ? param.values : [];
    expect([...(field.table ?? [])]).toStrictEqual([...values]);
  });

  const singleShapeFields = SINGLE_SHAPE_BLOCKS.flatMap(block => (fieldsFor(block) ?? []).map(field => ({
    title: `${block} ${field.name}`,
    field,
    param: PARAMS_BY_BLOCK[block].find(candidate => normalize(candidate.name) === normalize(field.name)),
  })));
  const discreteFields = singleShapeFields.flatMap(({ title, field, param }) =>
    param?.kind === "discrete" ? [{ title, table: [...(field.table ?? [])], values: [...param.values] }] : []);

  it.each(singleShapeFields)("$title is stored the way the catalog describes it", ({ field, param }) => {
    expect(codecClass(field)).toBe(param?.kind);
  });

  it.each(discreteFields)("$title stores exactly the catalog's values", ({ table, values }) => {
    expect(table).toStrictEqual(values);
  });
});

// Each per-type param carries `key` = the field name used in decoded patches (read_patch) and
// in an effect's params record when building, stamped automatically from the codec map,
// so an agent never has to guess "PRE-DELAY" → preDelay or "OCT F-BACK" → octFeedback.

const paramKey = (groupId: string, typeId: string, paramName: string): string | undefined =>
  groupTypes(groupId).find(capType => capType.id === typeId)?.params?.find(param => param.name === paramName)?.key;

describe("GX-1 param key stamping", () => {
  it.each([
    { group: "fx",     type: "CHORUS",     name: "PRE-DELAY",    key: "preDelay" },
    { group: "fx",     type: "PHASER",     name: "TYPE",         key: "stage" },
    { group: "fx",     type: "ROTARY",     name: "SPEED SELECT", key: "speed" },
    { group: "fx",     type: "FEEDBACKER", name: "OCT F-BACK",   key: "octFeedback" },
    { group: "delay",  type: "STANDARD",   name: "HIGH CUT",     key: "highCut" },
    { group: "reverb", type: "SHIMMER",    name: "PITCH LVL",    key: "pitchLevel" },
    { group: "reverb", type: "TERA ECHO",  name: "S-TIME",       key: "spreadTime" },
  ])("$group $type \"$name\" → key \"$key\"", ({ group, type, name, key }) => {
    expect(paramKey(group, type, name)).toBe(key);
  });

  // type params + any per-subtype params (fx DELAY's sub-algorithms carry their own).
  const typeParams = (capType: CapabilityType): ParamSpec[] =>
    [capType.params ?? [], ...(capType.subTypes ?? []).map(sub => sub.params ?? [])].flat();

  const keyedParams = (groupId: string): { groupId: string; type: string; param: ParamSpec }[] =>
    groupTypes(groupId).flatMap(capType => typeParams(capType).map(param => ({ groupId, type: capType.id, param })));

  // HARMONIST's KEY is the patch-level key, not a codec field, so it is the one param without a
  // `key`, and is filtered out of the case table rather than skipped with a conditional.
  const keyedParamCases = ["fx", "pedalFx", "delay", "reverb"].flatMap(keyedParams)
    .filter(({ groupId, type, param }) => !(groupId === "fx" && type === "HARMONIST" && param.name === "KEY"));

  it.each(keyedParamCases)("$groupId $type param \"$param.name\" carries a key", ({ param }) => {
    expect(param.key).toBeDefined();
  });
});

describe("GX-1 FX subtype coverage", () => {
  const PARAM_SUBTYPE_TABLES: Partial<Record<string, readonly string[]>> = {
    "COMPRESSOR":   COMP_TYPES,
    "LIMITER":      LIM_TYPES,
    "AC RESO":      ACRESO_TYPES,
    "CHORUS":       CHORUS_TYPES,
    "CLASSIC-VIBE": VIBE_MODES,
    "HUMANIZER":    HUM_MODES,
    "OD/DS":        ODDS_TYPES,
    "FIXED WAH":    WAH_TYPES,
    "DELAY":        FX_DLY_TYPES,
    "REVERB":       FX_REV_TYPES,
  };

  it("every PARAM_SUBTYPE_EFFECTS entry has a subtype table to check it against", () => {
    const untabled = [...PARAM_SUBTYPE_EFFECTS].filter(type => PARAM_SUBTYPE_TABLES[type] === undefined);

    expect(untabled).toStrictEqual([]);
  });

  const subtypeCoverageCases = [...PARAM_SUBTYPE_EFFECTS].map(fxTypeId => ({
    fxTypeId,
    table: PARAM_SUBTYPE_TABLES[fxTypeId] ?? [],
    found: groupTypes("fx").find(capType => capType.id === fxTypeId),
  }));

  it.each(subtypeCoverageCases)("$fxTypeId is registered in capabilities with its subTypes", ({ found, table }) => {
    expect(found).toBeDefined();
    const foundSubTypeIds = (found?.subTypes ?? []).map(subType => subType.id);
    expect(foundSubTypeIds).toStrictEqual(expect.arrayContaining([...table]));
  });

  const fxTypesWithSubTypes = groupTypes("fx").filter(capType => (capType.subTypes?.length ?? 0) > 0);

  it.each(fxTypesWithSubTypes)("$id is registered in PARAM_SUBTYPE_EFFECTS", (capType) => {
    expect(PARAM_SUBTYPE_EFFECTS.has(capType.id)).toBe(true);
  });
});

describe("GX-1 chain capability", () => {
  it("defaultOrder equals the builder's DEFAULT_CHAIN", () => {
    expect(gx1Capabilities.chain.defaultOrder).toStrictEqual(DEFAULT_CHAIN);
  });

  it("gives every block bypass true except volume, which the device can't switch off", () => {
    const notBypassable = Object.entries(gx1Capabilities.chain.blocks)
      .filter(([, block]) => !block.bypass)
      .map(([name]) => name);

    expect(notBypassable).toStrictEqual(["volume"]);
  });

  it("names group \"fx\" for all three fx slots", () => {
    const groups = ["fx1", "fx2", "fx3"].map(name => gx1Capabilities.chain.blocks[name]?.group);

    expect(groups).toStrictEqual(["fx", "fx", "fx"]);
  });

  it("labels every chain block from BLOCK_LABELS", () => {
    const labels = Object.entries(gx1Capabilities.chain.blocks).map(([name, block]) => [name, block.label]);

    expect(labels).toStrictEqual(Object.entries(BLOCK_LABELS));
  });

  it("withOnlyBlock scopes OVERTONE to fx3 alone", () => {
    const overtone = groupTypes("fx").find(capType => capType.id === "OVERTONE");

    expect(overtone?.blocks).toStrictEqual(["fx3"]);
  });

  it("leaves every other fx type unscoped", () => {
    const scoped = groupTypes("fx")
      .filter(capType => capType.id !== "OVERTONE" && capType.blocks !== undefined)
      .map(capType => capType.id);

    expect(scoped).toStrictEqual([]);
  });
});

// The patch's own settings belong to no block and so appear in no group. No other guard notices a
// codec field going undescribed here, or a described one naming a field the decoder never emits.
describe("GX-1 patch-settings capability", () => {
  const specs = gx1Capabilities.patchSettings;
  const codecFields = PATCH_SETTING_FIELDS.map(field => field.name);

  it("describes every setting the codec decodes, and no others", () => {
    const described = specs.map(spec => spec.key);

    expect(described.sort()).toStrictEqual([...codecFields].sort());
  });

  it("stamps each setting with the key a decoded patch carries it under", () => {
    const patch = blankPatch("Test") as unknown as Record<string, unknown>;
    const keys = specs.map(spec => spec.key);

    expect(Object.keys(patch)).toStrictEqual(expect.arrayContaining(keys));
  });
});

// The two numbers can drift silently: a generate schema capped at 13 while the format stores 16
// is internally consistent either way, and the committed exports' longest name happening to be 13
// characters would not surface the mismatch.
describe("GX-1 patch-name capability", () => {
  it("advertises the limit the codec actually encodes", () => {
    expect(gx1Capabilities.patchName.maxLength).toBe(NAME_BYTES);
  });
});

// The example exists to answer where a param is written, so what this guard checks is the shape:
// written under a real block key, carrying its controls under `params`. Whether an example builds
// through the validator is a separate, cross-unit concern, checked in integration/gx1RoundTrip.
describe("GX-1 spec examples", () => {
  const groupsWithBlocks = gx1Capabilities.groups.filter(group => BLOCK_NAMES.some(
    name => BLOCK_GROUPS[name] === group.id
  ));

  const examples = groupsWithBlocks.flatMap(group => {
    if (group.types.length === 0) return [{ group: group.id, type: "", subTypes: [] as string[], example: group.example }];
    return group.types.map(capType => ({
      group: group.id,
      type: capType.id,
      subTypes: (capType.subTypes ?? []).map(variant => variant.id),
      example: capType.example,
    }));
  });

  const bodyOf = (example?: PatchSpecExample): Record<string, unknown> =>
    Object.values(example ?? {})[0] as Record<string, unknown>;

  it.each(examples)("$group $type is written under a block of its group, with params", ({ group, example }) => {
    expect(example, "every block-backed type shows one").toBeDefined();
    const [block] = Object.keys(example ?? {});
    const body = bodyOf(example);

    expect(BLOCK_GROUPS[block as BlockName], "written under a real block key").toBe(group);
    expect(body.params, "carries its controls under the one key every block uses").toBeDefined();
  });

  it("OVERTONE's example is written under fx3, not fx1", () => {
    const overtone = groupTypes("fx").find(capType => capType.id === "OVERTONE");

    expect(Object.keys(overtone?.example ?? {})).toStrictEqual(["fx3"]);
  });

  // A type with sub-models opens on one, so an example leaving subType out shows a shape the
  // caller has to work out for itself. Naming one is only truthful if it is the model the device
  // opens with, which is what DEFAULT_SUBTYPES harvests and the defaults guard pins to the fixture.
  it.each(examples.filter(({ subTypes }) => subTypes.length > 0))(
    "$group $type's example names one of the type's own sub-models",
    ({ subTypes, example }) => {
      expect(subTypes).toContain(bodyOf(example).subType);
    },
  );

  it.each(examples.filter(({ subTypes }) => subTypes.length === 0))(
    "$group $type's example names no sub-model, having none",
    ({ example }) => {
      expect(bodyOf(example).subType).toBeUndefined();
    },
  );

  it("fills the values from the device's own factory defaults, not a guess", () => {
    const chorus = groupTypes("fx").find(capType => capType.id === "CHORUS");
    const example = chorus?.example?.fx1 as { params: Record<string, unknown> };

    expect(example.params).toStrictEqual(DEFAULTS_BY_TYPE.fx.CHORUS);
  });

  it("takes its params from the sub-model where the sub-model owns them", () => {
    const delay = groupTypes("fx").find(capType => capType.id === "DELAY");
    const example = delay?.example?.fx1 as { subType: string; params: Record<string, unknown> };

    expect(example.params).toStrictEqual(DEFAULTS_BY_TYPE.fxDelay[example.subType]);
  });

  // acceptedKeys drops any default whose key the chosen type/sub-model doesn't accept (a sub-model
  // selector's own field among them), which this checks held across every example at once.
  it("never carries a param key the type or sub-model doesn't accept", () => {
    const offending = examples.flatMap(({ group, type, example }) => {
      if (example === undefined) return [];
      const groupObj = present(gx1Capabilities.groups.find(candidate => candidate.id === group), group);
      const capType = groupObj.types.find(candidate => candidate.id === type);
      const body = bodyOf(example);
      const variant = capType?.subTypes?.find(sub => sub.id === body.subType);
      const accepted = new Set(
        [...(groupObj.params ?? []), ...(capType?.params ?? []), ...(variant?.params ?? [])]
          .map(param => param.key)
          .filter((key): key is string => key !== undefined)
      );
      const params = (body.params ?? {}) as Record<string, unknown>;
      return Object.keys(params).filter(key => !accepted.has(key)).map(key => `${group}/${type}:${key}`);
    });

    expect(offending).toStrictEqual([]);
  });

  it("leaves the example off a group that names no block", () => {
    const lookupOnlyGroups = gx1Capabilities.groups.filter(group => ["cab", "mic"].includes(group.id));

    expect(lookupOnlyGroups.map(group => group.example)).toStrictEqual(lookupOnlyGroups.map(() => undefined));
  });

  const lookupOnlyTypes = gx1Capabilities.groups
    .filter(group => ["cab", "mic"].includes(group.id))
    .flatMap(group => group.types.map(capType => ({ groupId: group.id, typeId: capType.id, capType })));

  it.each(lookupOnlyTypes)("$groupId $typeId carries no example, its group naming no block", ({ capType }) => {
    expect(capType.example).toBeUndefined();
  });
});
