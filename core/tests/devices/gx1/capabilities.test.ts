/**
 * Drift guards — codec ↔ catalog.
 *
 * capabilities.ts now derives every params list from param-catalog.ts, so the meaningful
 * axis to guard is the catalog (authored from the parameter guide) against the codec field
 * maps (authored from byte reverse-engineering) — two independently-authored sources that
 * can drift. These tests assert, for every type of every block:
 *   - id coverage: the codec's type list, the catalog's keys, and capabilities' item ids
 *     all agree;
 *   - param parity: every codec field maps to a catalog param and vice versa (bidirectional),
 *     modulo documented aliases (wording differences) and exceptions.
 * A new effect type or codec field that isn't in the catalog fails the suite.
 */
import { describe, it, expect } from "vitest";
import {
  FX_TYPES, AMP_TYPES, SP_TYPES, MIC_TYPES, ODDS_TYPES, DLY_TYPES, REV_TYPES, PFX_TYPES,
  FX_DLY_TYPES, FX_REV_TYPES,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, CHORUS_TYPES, VIBE_MODES, HUM_MODES,
  PARAM_SUBTYPE_EFFECTS,
} from "../../../src/devices/gx1/common";
import { gx1Capabilities } from "../../../src/devices/gx1/capabilities";
import { DEFAULT_CHAIN } from "../../../src/devices/gx1/builder";
import { PARAMS_BY_TYPE, PARAMS_BY_BLOCK, FIELD_LABEL_ALIASES } from "../../../src/devices/gx1/param-catalog";
import { FX_PARAM_MAPS, FX_DELAY_TYPE_MAPS } from "../../../src/devices/gx1/codec/fx-params";
import {
  PFX_TYPE_MAPS, DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES,
  decodeAmp, decodeOdDs, decodeNs, decodeFv,
} from "../../../src/devices/gx1/codec/blocks";
import { hexFromBytes } from "../../../src/devices/gx1/codec/primitives";
import type { CapabilityItem, ParamSpec } from "../../../src/types";
import type { FieldCodec } from "../../../src/devices/gx1/codec/fields";

const groupItems = (groupId: string): CapabilityItem[] =>
  gx1Capabilities.groups.find(group => group.id === groupId)?.items ?? [];

// Normalizes a param/field name for comparison: lowercase, strip anything that isn't a
// letter or digit — so "PRE-DELAY" (catalog) and "preDelay" (codec) match.
const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const codecFieldNames = (fields: readonly FieldCodec[] | undefined): Set<string> =>
  new Set((fields ?? []).map(field => normalize(field.name)));

const catalogParamNames = (params: readonly ParamSpec[] | undefined): Set<string> =>
  new Set((params ?? []).map(param => normalize(param.name)));

// ── id coverage: codec type list === catalog keys === capabilities item ids ────

interface PerTypeBlock {
  /** capabilities/catalog block id. */
  block: "fx" | "pfx" | "delay" | "reverb" | "fxDelay";
  /** authoritative codec type list from constants.ts. */
  types: readonly string[];
  /** the type's codec field map (undefined = not yet modeled). */
  codecFields: (type: string) => readonly FieldCodec[] | undefined;
  /** codec field names to skip in the reverse (codec → catalog) check — sub-model selectors. */
  reverseSkip: ReadonlySet<string>;
  /** per-type alias map: codec field name → the catalog param label it corresponds to. */
  aliases: Record<string, Record<string, string>>;
  /** per-type catalog params that have no codec field, for a documented reason. */
  paramOnly: Record<string, ReadonlySet<string>>;
}

const reverbCodecFields = (type: string): readonly FieldCodec[] | undefined =>
  (STANDARD_REVERB_TYPES as readonly string[]).includes(type)
    ? REV_TYPE_MAPS.STANDARD
    : REV_TYPE_MAPS[type];

const PER_TYPE_BLOCKS: PerTypeBlock[] = [
  {
    block: "fx",
    types: FX_TYPES,
    codecFields: (type) => FX_PARAM_MAPS[type],
    reverseSkip: new Set(["type"]),
    aliases: FIELD_LABEL_ALIASES.fx,
    paramOnly: {
      // KEY is the patch's global key (Patch.key), not a per-effect param.
      "HARMONIST": new Set(["KEY"]),
    },
  },
  {
    block: "pfx",
    types: PFX_TYPES,
    codecFields: (type) => PFX_TYPE_MAPS[type],
    // wahType is WAH's own sub-model selector, modeled via subTypes rather than a param.
    reverseSkip: new Set(["wahType"]),
    aliases: FIELD_LABEL_ALIASES.pfx,
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
    codecFields: reverbCodecFields,
    reverseSkip: new Set(),
    aliases: FIELD_LABEL_ALIASES.reverb,
    paramOnly: {},
  },
];

// The FX-slot DELAY is the one fx type modeled per-sub-algorithm (like the dedicated delay
// block). It isn't a top-level capability group — it lives as the subTypes of the fx DELAY
// item — so it gets its own coverage check below rather than joining PER_TYPE_BLOCKS.
const FX_DELAY_BLOCK: PerTypeBlock = {
  block: "fxDelay",
  types: FX_DLY_TYPES,
  codecFields: (type) => FX_DELAY_TYPE_MAPS[type],
  reverseSkip: new Set(["type"]),
  aliases: FIELD_LABEL_ALIASES.fxDelay,
  paramOnly: {},
};

describe("GX-1 catalog id coverage", () => {
  it.each(PER_TYPE_BLOCKS)("$block: codec types, catalog keys, and capabilities items all agree", ({ block, types }) => {
    const codecTypes = new Set(types);
    const catalogTypes = new Set(Object.keys(PARAMS_BY_TYPE[block]));
    const capabilityTypes = new Set(groupItems(block).map(item => item.id));

    expect(catalogTypes, `${block} catalog keys vs codec types`).toEqual(codecTypes);
    expect(capabilityTypes, `${block} capabilities items vs codec types`).toEqual(codecTypes);
  });

  // Selection-only / metadata-only blocks: capabilities must list every codec model id.
  it.each([
    { block: "amp", types: AMP_TYPES },
    { block: "cab", types: SP_TYPES },
    { block: "mic", types: MIC_TYPES },
    { block: "odds", types: ODDS_TYPES },
  ])("$block: capabilities lists every codec model id", ({ block, types }) => {
    const capabilityIds = new Set(groupItems(block).map(item => item.id));

    for (const type of types) {
      expect(capabilityIds, `${block} model "${type}" is missing from capabilities`).toContain(type);
    }
  });
});

// ── param parity: codec fields ↔ catalog params, bidirectional, per type ───────

const assertTypeParity = (block: PerTypeBlock, type: string): void => {
  const fields = block.codecFields(type);
  const codecNames = codecFieldNames(fields);
  const catalog = PARAMS_BY_TYPE[block.block][type];
  const catalogNames = catalogParamNames(catalog);
  const aliases = block.aliases[type] ?? {};
  const aliasTargets = new Set(Object.values(aliases).map(normalize));
  const paramOnly = block.paramOnly[type] ?? new Set<string>();

  // Forward: every catalog param maps to a codec field (or is an alias target / param-only).
  for (const param of catalog) {
    const matches = codecNames.has(normalize(param.name))
      || aliasTargets.has(normalize(param.name))
      || paramOnly.has(param.name);
    expect(matches, `${block.block} "${type}" catalog param "${param.name}" has no matching codec field`).toBe(true);
  }

  // Reverse: every codec field maps to a catalog param (or is an alias / skipped selector).
  for (const field of fields ?? []) {
    if (block.reverseSkip.has(field.name)) continue;
    const matches = catalogNames.has(normalize(field.name)) || field.name in aliases;
    expect(matches, `${block.block} "${type}" codec field "${field.name}" is missing from the catalog`).toBe(true);
  }
};

describe("GX-1 codec ↔ catalog param parity (per-type blocks)", () => {
  for (const block of PER_TYPE_BLOCKS) {
    describe(block.block, () => {
      it.each(block.types)("%s: codec fields and catalog params match", (type) => {
        assertTypeParity(block, type);
      });
    });
  }
});

// ── FX-slot DELAY: per-sub-algorithm codec ↔ catalog (nested under the fx DELAY item) ──

describe("GX-1 FX-slot DELAY per-sub-algorithm parity", () => {
  const fxDelayItem = groupItems("fx").find(item => item.id === "DELAY");

  it("codec sub-algorithms, catalog keys, and DELAY subTypes all agree", () => {
    const codecTypes = new Set<string>(FX_DLY_TYPES);
    const catalogTypes = new Set(Object.keys(PARAMS_BY_TYPE.fxDelay));
    const subTypeIds = new Set((fxDelayItem?.subTypes ?? []).map(subType => subType.id));

    expect(catalogTypes, "fxDelay catalog keys vs codec sub-algorithms").toEqual(codecTypes);
    expect(subTypeIds, "fx DELAY subTypes vs codec sub-algorithms").toEqual(codecTypes);
  });

  it.each(FX_DELAY_BLOCK.types)("%s: codec fields and catalog params match", (type) => {
    assertTypeParity(FX_DELAY_BLOCK, type);
  });
});

// ── single-shape blocks: decoded fields ↔ catalog block params ─────────────────
//
// amp/odds/ns/fv are fixed-shape blocks decoded by hand-written functions rather than a
// FieldCodec table, so decoding placeholder bytes and reading the object's keys gets the
// field-name set without duplicating a list that could drift from blocks.ts.

const decodedFieldNames = (decoded: object, exceptions: Set<string>): Set<string> =>
  new Set(Object.keys(decoded).filter(key => !exceptions.has(key)).map(normalize));

const assertBlockParity = (block: "amp" | "odds" | "ns" | "fv", codecNames: Set<string>): void => {
  const catalogNames = catalogParamNames(PARAMS_BY_BLOCK[block]);
  for (const name of codecNames) {
    expect(catalogNames, `"${block}" codec field "${name}" is missing from the catalog`).toContain(name);
  }
  for (const name of catalogNames) {
    expect(codecNames, `"${block}" catalog param "${name}" has no matching codec field`).toContain(name);
  }
};

describe("GX-1 codec ↔ catalog param parity (single-shape blocks)", () => {
  // speaker/mic were once excepted here as "covered by their own groups" — having a cab group does
  // not make the amp block's own speaker field discoverable from an amp lookup, and leaving them out
  // of the catalog hid them from describe_device and the CLI alike. They are ordinary amp params.
  it("amp (excluding on/type)", () => {
    const decoded = decodeAmp(hexFromBytes(new Array<number>(13).fill(0)));

    assertBlockParity("amp", decodedFieldNames(decoded, new Set(["on", "type"])));
  });

  it("odds (excluding on/type, covered elsewhere)", () => {
    const decoded = decodeOdDs(hexFromBytes(new Array<number>(8).fill(0)));

    assertBlockParity("odds", decodedFieldNames(decoded, new Set(["on", "type"])));
  });

  it("ns (excluding on)", () => {
    const decoded = decodeNs(hexFromBytes(new Array<number>(4).fill(0)));

    assertBlockParity("ns", decodedFieldNames(decoded, new Set(["on"])));
  });

  it("fv", () => {
    const decoded = decodeFv(hexFromBytes(new Array<number>(4).fill(0)));

    assertBlockParity("fv", decodedFieldNames(decoded, new Set()));
  });
});

// Single-shape blocks are hand-decoded, so capabilities derives their param `key` from the catalog
// label rather than reading it off a codec field map. That derivation is only safe if every key it
// produces is a field the decoder actually emits — which is what this checks.
describe("GX-1 single-shape block param keys name a real decoded field", () => {
  const decodedBlocks = {
    amp: decodeAmp(hexFromBytes(new Array<number>(13).fill(0))),
    odds: decodeOdDs(hexFromBytes(new Array<number>(8).fill(0))),
    ns: decodeNs(hexFromBytes(new Array<number>(4).fill(0))),
    fv: decodeFv(hexFromBytes(new Array<number>(4).fill(0))),
  };

  it.each(Object.keys(decodedBlocks))("%s", (blockId) => {
    const group = gx1Capabilities.groups.find(candidate => candidate.id === blockId);
    const fields = Object.keys(decodedBlocks[blockId as keyof typeof decodedBlocks]);

    expect(group?.params, `"${blockId}" should expose block params`).toBeDefined();
    for (const param of group?.params ?? []) {
      expect(fields, `"${blockId}" param "${param.name}" stamped key "${param.key}"`).toContain(param.key);
    }
  });
});

// ── representation parity: codec field kind ↔ catalog param domain ─────────────
//
// The name-parity guards above match field/param NAMES only. This guard is auto-derived over
// every per-type codec field and asserts its *representation* agrees with the catalog's authored
// domain: a boolean toggle is a `bool` field; an enum/lookup is a `lookup`/`indexTable` whose
// table equals the catalog `values` verbatim; a numeric range is a numeric field. It catches a
// catalog enum backed by a hand-rolled numeric codec (how PHASER `stage` shipped a raw index) and
// the trigger/solo drift between strings, numbers, and booleans — without a hand-maintained list,
// so a new effect/field can't silently reintroduce the class. Catalog `text` domains (compact
// displays like SLICER "P01-P20", HARMONIST harmony) are opaque by design, so their representation
// is intentionally not pinned. (amp/odds/ns/fv are hand-decoded, not FieldCodec maps, so they're
// covered by their own round-trip guards above rather than here.)

const NUMERIC_KINDS = new Set(["u8", "signed", "scaled", "nibblePair", "nibbleQuad"]);

type ReprClass = "numeric" | "discrete" | "boolean" | "text" | "unknown";

const codecClass = (field: FieldCodec): ReprClass => {
  if (field.kind === "bool") return "boolean";
  if (field.kind === "lookup") return "discrete";
  // indexTable holds a mixed string/number table (PITCH SHIFT's pitch presets) — opaque like a
  // catalog `text` domain, so its representation isn't strictly pinned.
  if (field.kind === "indexTable") return "text";
  const numeric = field.kind !== undefined && NUMERIC_KINDS.has(field.kind);
  const cls: ReprClass = numeric ? "numeric" : "unknown";
  return cls;
};

const catalogClass = (param: ParamSpec): ReprClass => {
  if (param.values !== undefined) return "discrete";
  if (param.min !== undefined) return "numeric";
  const cls: ReprClass = param.range === "true, false" ? "boolean" : "text";
  return cls;
};

const representationChecks = [...PER_TYPE_BLOCKS, FX_DELAY_BLOCK].flatMap(block =>
  block.types.flatMap(type =>
    (block.codecFields(type) ?? [])
      .filter(field => !block.reverseSkip.has(field.name))
      .map(field => ({ title: `${block.block} ${type}.${field.name}`, block, type, field })),
  ),
);

const assertRepresentationParity = (block: PerTypeBlock, type: string, field: FieldCodec): void => {
  const aliases = block.aliases[type] ?? {};
  const catalogLabel = field.name in aliases ? aliases[field.name] : field.name;
  const param = PARAMS_BY_TYPE[block.block][type].find(candidate => normalize(candidate.name) === normalize(catalogLabel));
  expect(param, `${block.block} "${type}" catalog has no param for codec field "${field.name}"`).toBeDefined();
  if (!param) return;

  const catClass = catalogClass(param);
  const codClass = codecClass(field);
  // Opaque on either side (catalog `text` display, or a mixed indexTable) — not strictly pinned.
  if (catClass === "text" || codClass === "text") return;

  expect(
    codClass,
    `${block.block} "${type}" field "${field.name}": codec kind "${field.kind ?? "none"}" vs catalog domain "${catClass}"`,
  ).toBe(catClass);

  if (catClass === "discrete") {
    expect(
      [...(field.table ?? [])],
      `${block.block} "${type}" field "${field.name}": codec table vs catalog values`,
    ).toEqual([...(param.values ?? [])]);
  }
};

describe("GX-1 codec ↔ catalog representation parity", () => {
  it.each(representationChecks)("$title", ({ block, type, field }) => {
    assertRepresentationParity(block, type, field);
  });
});

// ── param key stamping: describe_device param.key === the codec/decoded field name ──
//
// Each per-type param carries `key` = the field name used in decoded patches (read_patch) and
// in an effect's params record when building — stamped automatically from the codec map,
// so an agent never has to guess "PRE-DELAY" → preDelay or "OCT F-BACK" → octFeedback.

const paramKey = (groupId: string, itemId: string, paramName: string): string | undefined =>
  groupItems(groupId).find(item => item.id === itemId)?.params?.find(param => param.name === paramName)?.key;

describe("GX-1 param key stamping", () => {
  it.each([
    { group: "fx",     item: "CHORUS",     name: "PRE-DELAY",    key: "preDelay" },
    { group: "fx",     item: "PHASER",     name: "TYPE",         key: "stage" },
    { group: "fx",     item: "ROTARY",     name: "SPEED SELECT", key: "speed" },
    { group: "fx",     item: "FEEDBACKER", name: "OCT F-BACK",   key: "octFeedback" },
    { group: "delay",  item: "STANDARD",   name: "HIGH CUT",     key: "highCut" },
    { group: "reverb", item: "SHIMMER",    name: "PITCH LVL",    key: "pitchLevel" },
    { group: "reverb", item: "TERA ECHO",  name: "S-TIME",       key: "spreadTime" },
  ])("$group $item \"$name\" → key \"$key\"", ({ group, item, name, key }) => {
    expect(paramKey(group, item, name)).toBe(key);
  });

  // item params + any per-subtype params (fx DELAY's sub-algorithms carry their own).
  const itemParams = (item: CapabilityItem): ParamSpec[] =>
    [item.params ?? [], ...(item.subTypes ?? []).map(sub => sub.params ?? [])].flat();

  const keyedParams = (groupId: string): { item: string; param: ParamSpec }[] =>
    groupItems(groupId).flatMap(item => itemParams(item).map(param => ({ item: item.id, param })));

  // HARMONIST's KEY is the patch-level key, not a codec field — the one param without a `key`.
  const isParamOnly = (groupId: string, item: string, name: string): boolean =>
    groupId === "fx" && item === "HARMONIST" && name === "KEY";

  it("stamps a key on every per-type capability param (except paramOnly HARMONIST KEY)", () => {
    for (const groupId of ["fx", "pfx", "delay", "reverb"]) {
      for (const { item, param } of keyedParams(groupId)) {
        if (isParamOnly(groupId, item, param.name)) continue;
        expect(param.key, `${groupId} "${item}" param "${param.name}"`).toBeDefined();
      }
    }
  });
});

// ── subtype coverage: capabilities subTypes ↔ PARAM_SUBTYPE_EFFECTS ─────────────

describe("GX-1 FX subtype coverage", () => {
  it("covers every PARAM_SUBTYPE_EFFECTS entry as subTypes of the corresponding FX item", () => {
    const paramSubtypeTables: Record<string, readonly string[]> = {
      "COMPRESSOR":   COMP_TYPES,
      "LIMITER":      LIM_TYPES,
      "AC RESO":      ACRESO_TYPES,
      "CHORUS":       CHORUS_TYPES,
      "CLASSIC-VIBE": VIBE_MODES,
      "HUMANIZER":    HUM_MODES,
      "OD/DS":        ODDS_TYPES,
      "DELAY":        FX_DLY_TYPES,
      "REVERB":       FX_REV_TYPES,
    };
    const fxItems = groupItems("fx");

    for (const [fxType, subTypes] of Object.entries(paramSubtypeTables)) {
      const fxItem = fxItems.find(item => item.id === fxType);
      expect(fxItem, `FX item "${fxType}" from PARAM_SUBTYPE_EFFECTS is missing from capabilities`).toBeDefined();

      const itemSubTypeIds = new Set((fxItem?.subTypes ?? []).map(subType => subType.id));
      for (const subId of subTypes) {
        expect(itemSubTypeIds, `Subtype "${subId}" of FX type "${fxType}" is missing from capabilities`).toContain(subId);
      }
    }
  });

  it("every fx item with subTypes is registered in PARAM_SUBTYPE_EFFECTS", () => {
    for (const item of groupItems("fx")) {
      if (!item.subTypes || item.subTypes.length === 0) continue;
      expect(
        PARAM_SUBTYPE_EFFECTS.has(item.id),
        `FX item "${item.id}" has subTypes but is missing from PARAM_SUBTYPE_EFFECTS`
      ).toBe(true);
    }
  });
});

// ── chain capability: defaultOrder can't drift from the builder's DEFAULT_CHAIN ──

describe("GX-1 chain capability", () => {
  it("defaultOrder equals the builder's DEFAULT_CHAIN", () => {
    expect(gx1Capabilities.chain.defaultOrder).toEqual(DEFAULT_CHAIN);
  });

  it("describes bypass via `on` and names FV as the exception", () => {
    const { description } = gx1Capabilities.chain;
    expect(description, "chain description mentions bypass via on: false").toMatch(/on: false/);
    expect(description, "chain description names the FV exception").toContain("FV");
  });

  // Omitting a block and passing `on: false` both leave it off but store different bytes, so the
  // one place that teaches bypass names omission as the default choice and says what `on: false`
  // buys you — otherwise consumers pick one by guesswork.
  it("explains both ways to leave a block off", () => {
    const { description } = gx1Capabilities.chain;
    expect(description, "bypass preserves the params passed with it").toMatch(/behind the bypass/);
    expect(description, "omitting a block is the other way to leave it off").toMatch(/Omitting a block/);
  });
});
