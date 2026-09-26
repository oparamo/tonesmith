/**
 * The catalog checks and the dot-path engine, held against a small catalog written for these tests
 * rather than any real device's. Each device's own suite checks its catalog's facts; this one checks
 * what `specService` does with whatever catalog it is handed, including shapes no device on the
 * roster has yet.
 */
import { describe, it, expect } from "vitest";
import {
  applyEdits, setBlocks, validatePatchSettings, validateSpec, validateTypeParams,
} from "../../src/service/specService";
import type { EditingDevice } from "../../src/service/specService";
import type { DeviceCapabilities, FieldValue, ParamSpec, Patch } from "../../src/model";
import { present } from "../helpers";

const numeric = (key: string, [min, max]: [number, number], decimals?: number): ParamSpec =>
  ({ key, name: key.toUpperCase(), range: `${min}-${max}`, description: "", kind: "numeric", min, max, decimals });

const discrete = (key: string, name: string, values: string[]): ParamSpec =>
  ({ key, name, range: values.join(", "), description: "", kind: "discrete", values });

const boolean = (key: string, name: string): ParamSpec =>
  ({ key, name, range: "true, false", description: "", kind: "boolean" });

const TIME: ParamSpec = {
  key: "time", name: "TIME", range: "0-100, 1/4, 1/8", description: "",
  kind: "numericOrNamed", min: 0, max: 100, values: ["1/4", "1/8"],
};

const type = (id: string, extra: object = {}) => ({ id, name: id, description: "", ...extra });

/**
 * A tone block whose types share only the group's own params (A); two copies of one effect slot
 * (fx) covering the shapes the checks branch on: a type with named-number params, a type with
 * sub-models that bring their own params, a sub-model type whose variants carry none of their own
 * (B), a type only one slot offers, a type whose variant is an ordinary param labeled TYPE, and a
 * type the fake builder refuses (C); and a gate the device keeps on at all times.
 */
const CATALOG: DeviceCapabilities = {
  chain: {
    description: "",
    defaultOrder: ["amp", "slot1", "slot2", "gate"],
    blocks: {
      amp: { label: "Amp", group: "tone", bypass: true },
      slot1: { label: "S1", group: "fx", bypass: true },
      slot2: { label: "S2", group: "fx", bypass: true },
      gate: { label: "G", group: "gate", bypass: false },
    },
  },
  patchName: { maxLength: 8 },
  patchSettings: [numeric("tempo", [40, 250]), numeric("trim", [-6, 6], 1)],
  groups: [
    {
      id: "tone", name: "Tone", description: "",
      types: [type("BRIGHT"), type("DARK")],
      params: [numeric("gain", [0, 100])],
    },
    {
      id: "fx", name: "FX", description: "",
      types: [
        type("ECHO", { params: [TIME, numeric("level", [0, 100]), discrete("mode", "MODE", ["A", "B"])] }),
        type("SPLIT", { subTypes: [type("WIDE", { params: [numeric("width", [0, 10])] }), type("NARROW")] }),
        type("LOCKED", { blocks: ["slot2"], params: [numeric("depth", [0, 100]), boolean("mute", "MUTE")] }),
        type("PLAIN", { params: [discrete("variant", "TYPE", ["SOFT", "HARD"])] }),
        type("SQUASH", { params: [numeric("sustain", [0, 100])], subTypes: [type("SOFT"), type("HARD")] }),
        type("BROKEN", { params: [numeric("level", [0, 100])] }),
      ],
    },
    { id: "gate", name: "Gate", description: "", types: [], params: [numeric("threshold", [0, 100])] },
  ],
};

/** The factory controls of each selection, which a re-seed is expected to bring up. */
const FACTORY: Record<string, Record<string, FieldValue>> = {
  ECHO: { time: 10, level: 50, mode: "A" },
  WIDE: { width: 3 },
  NARROW: {},
  LOCKED: { depth: 20, mute: false },
  PLAIN: { variant: "SOFT" },
  SQUASH: { sustain: 50 },
  SOFT: {},
  HARD: {},
};

/** The sub-model a type opens on when a re-seed names none, mirroring what a real builder does. */
const FACTORY_SUBTYPE: Record<string, string> = { SPLIT: "WIDE", SQUASH: "SOFT" };

/** Builds only the blocks a spec names, at factory settings, which is all a re-seed reads back. */
const buildPatch = (spec: unknown): Patch => {
  const { name, ...blocks } = spec as Record<string, Record<string, unknown>>;
  const built = Object.fromEntries(Object.entries(blocks).map(([blockName, input]) => {
    if (input.type === "BROKEN") throw new Error("this device refuses BROKEN");
    const factorySubType = FACTORY_SUBTYPE[input.type as string] ?? null;
    const subType = (input.subType as string | undefined) ?? factorySubType;
    const subTypeControls = subType === null ? {} : (FACTORY[subType] ?? {});
    const controls = { ...(FACTORY[input.type as string] ?? {}), ...subTypeControls };
    return [blockName, { on: input.on ?? true, type: input.type, subType, params: { ...controls } }];
  }));
  return { name: name as unknown as string, ...built };
};

const DEVICE: EditingDevice = { capabilities: CATALOG, buildPatch };

const echoPatch = (): Patch => ({
  name: "Test",
  tempo: 120,
  amp: { on: true, type: "BRIGHT", subType: null, params: { gain: 40 } },
  slot1: { on: true, type: "ECHO", subType: null, params: { time: 40, level: 60, mode: "B" } },
  slot2: { on: false, type: "ECHO", subType: null, params: { time: "1/4", level: 60, mode: "A" } },
  gate: { params: { threshold: 30 } },
} as Patch);

const edit = (patch: Patch, edits: Record<string, FieldValue>) => applyEdits(DEVICE, patch, Object.entries(edits));

const slot = (patch: Patch, name: string): Record<string, unknown> =>
  present((patch as unknown as Record<string, Record<string, unknown>>)[name], `${name} on the patch`);

/** Reaches a decoded block's field by the same path a caller writes, for reading the result back. */
const valueAt = (patch: Patch, path: string): unknown => {
  let current = patch as unknown as Record<string, unknown>;
  const parts = path.split(".");
  const leaf = parts.pop() ?? path;
  for (const part of parts) current = current[part] as Record<string, unknown>;
  return current[leaf];
};

/** The message a throwing call rejects with, or "" when it doesn't throw. */
const messageFrom = (attempt: () => unknown): string => {
  try {
    attempt();
    return "";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("validateTypeParams", () => {
  it("leaves a type the catalog doesn't know to the type check", () => {
    expect(validateTypeParams(CATALOG, { group: "fx", type: "NOPE", values: { level: 500 } })).toStrictEqual([]);
  });

  it("names the param, the type and the value when a number is out of range", () => {
    const [issue, ...rest] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { level: 500 } });

    expect(rest).toStrictEqual([]);
    expect(issue).toContain("LEVEL");
    expect(issue).toContain("ECHO");
    expect(issue).toContain("500");
  });

  it("ignores a key the type has no param for, leaving it to the key check", () => {
    expect(validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { bogus: 1 } })).toStrictEqual([]);
  });

  it("takes either half of a numeric-or-named param", () => {
    const issues = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { time: "1/8" } });

    expect(issues).toStrictEqual([]);
  });

  it("rejects a named value the param doesn't have, listing the ones it does", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { time: "1/5" } });

    expect(issue).toContain("1/5");
    expect(issue).toContain("1/4");
  });

  it("rejects a numericOrNamed value's number when it is out of range", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { time: 500 } });

    expect(issue).toContain("500");
  });

  it("checks a discrete value against its list", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { mode: "C" } });

    expect(issue).toContain("MODE");
    expect(issue).toContain("C");
  });

  it("checks a sub-model's own params along with its type's", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "SPLIT", subType: "WIDE", values: { width: 99 } });

    expect(issue).toContain("WIDTH");
  });

  it("rejects a sub-model the type doesn't have, listing the ones it does", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "SPLIT", subType: "TALL", values: {} });

    expect(issue).toContain("TALL");
    expect(issue).toContain("WIDE");
  });

  it("matches a subType case-insensitively, as a type id matches", () => {
    const issues = validateTypeParams(CATALOG, { group: "fx", type: "SPLIT", subType: "wide", values: { width: 3 } });

    expect(issues).toStrictEqual([]);
  });

  it("rejects a subType on a type with no variants to choose from at all", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", subType: "ANYTHING", values: {} });

    expect(issue).toContain("no variants");
  });

  // A variant carried as an ordinary param encodes nowhere when sent as a subType, so the rejection
  // has to name the param that does carry it.
  it("points a sub-model on a type without any at the param labeled TYPE", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "PLAIN", subType: "SOFT", values: {} });

    expect(issue).toContain("params.variant");
  });

  it("reports a group-level param without a type label, for a group with no types", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "gate", values: { threshold: 500 } });

    expect(issue).toContain("THRESHOLD");
    expect(issue).not.toContain(" for ");
  });

  it.each([
    { kind: "numeric", key: "level", value: "12" },
    { kind: "discrete", key: "mode", value: 1 },
    { kind: "numericOrNamed", key: "time", value: true },
  ])("rejects a $kind value of the wrong kind", ({ key, value }) => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { [key]: value } });

    expect(issue).toBeDefined();
  });

  it("rejects a boolean param given a non-boolean value", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "LOCKED", values: { mute: "yes" } });

    expect(issue).toContain("MUTE");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects %s for a numeric param",
    (value) => {
      const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { level: value } });

      expect(issue).toBeDefined();
    }
  );

  it.each([
    { value: -1, valid: false },
    { value: 0, valid: true },
    { value: 100, valid: true },
    { value: 101, valid: false },
  ])("checks a numeric param's bounds at $value", ({ value, valid }) => {
    const issues = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { level: value } });

    expect(issues.length === 0).toBe(valid);
  });

  it("rejects a string for a numeric param, naming the param and the value", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { level: "loud" } });

    expect(issue).toContain("LEVEL");
    expect(issue).toContain("loud");
  });

  it("rejects a fraction for a param the catalog gives no decimals", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "ECHO", values: { level: 50.5 } });

    expect(issue).toContain("LEVEL");
  });
});

describe("validatePatchSettings", () => {
  it("checks the settings a spec carries and skips every other key", () => {
    const issues = validatePatchSettings(CATALOG, { tempo: 300, trim: 1.5, slot1: { type: "ECHO" } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("300");
  });

  it("accepts a fraction for a setting with decimals", () => {
    expect(validatePatchSettings(CATALOG, { trim: 2.5 })).toStrictEqual([]);
  });

  it("rejects a fraction for a setting without decimals", () => {
    expect(validatePatchSettings(CATALOG, { tempo: 120.5 })).toHaveLength(1);
  });
});

describe("setBlocks", () => {
  it("folds a bare bypass into a block left out, for a block that can be bypassed", () => {
    expect(setBlocks(CATALOG, { slot1: { on: false }, slot2: { type: "ECHO" } })).toStrictEqual(["slot2"]);
  });

  it("keeps a bare bypass on a block that can't be bypassed, so the check reports it", () => {
    expect(setBlocks(CATALOG, { gate: { on: false } })).toStrictEqual(["gate"]);
  });

  it("follows the chain's own order rather than the spec's key order", () => {
    expect(setBlocks(CATALOG, { slot2: { type: "ECHO" }, slot1: { type: "ECHO" } })).toStrictEqual(["slot1", "slot2"]);
  });

  it("keeps a block whose spec is an empty object, which is not a bare bypass", () => {
    expect(setBlocks(CATALOG, { slot1: {} })).toStrictEqual(["slot1"]);
  });

  it("treats on: false alongside an explicit undefined type as a bare bypass too", () => {
    expect(setBlocks(CATALOG, { slot1: { on: false, type: undefined } })).toStrictEqual([]);
  });

  it("keeps a block set on: true, since bypass folding only ever applies to on: false", () => {
    expect(setBlocks(CATALOG, { slot1: { on: true } })).toStrictEqual(["slot1"]);
  });
});

describe("validateSpec", () => {
  it("accepts a spec whose blocks and settings all fit", () => {
    const spec = { name: "Ok", tempo: 90, slot1: { type: "ECHO", params: { level: 10 } }, gate: { params: { threshold: 5 } } };

    expect(validateSpec(CATALOG, spec)).toStrictEqual([]);
  });

  it("rejects a type in a block that doesn't offer it, naming the block that does", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { type: "LOCKED" } });

    expect(issue).toContain("slot1");
    expect(issue).toContain("slot2");
  });

  it("asks for a type when a block with types names none, listing them", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { params: { level: 10 } } });

    expect(issue).toContain("ECHO");
  });

  it("says a param sent beside the block's selectors belongs under params", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { type: "ECHO", level: 10 } });

    expect(issue).toContain("level");
    expect(issue).toContain("params");
  });

  it("rejects a control the chosen type doesn't have", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { type: "ECHO", params: { width: 3 } } });

    expect(issue).toContain("width");
  });

  it("rejects on for a block the device keeps on", () => {
    const [issue] = validateSpec(CATALOG, { gate: { on: false, params: { threshold: 5 } } });

    expect(issue).toContain('"on"');
  });

  it("reports every problem at once", () => {
    const spec = { tempo: 10, slot1: { type: "ECHO", params: { level: 500, mode: "C" } } };

    expect(validateSpec(CATALOG, spec)).toHaveLength(3);
  });

  it("rejects a type the block doesn't have, listing the ones it does", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { type: "NOPE" } });

    expect(issue).toContain("NOPE");
    expect(issue).toContain("ECHO");
  });

  it("rejects a type given only as a prefix of a type's name, rather than matching it loosely", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { type: "EC" } });

    expect(issue).toContain("EC");
    expect(issue).toContain("ECHO");
  });

  it("accepts a block that names only its type, leaving the rest to default", () => {
    expect(validateSpec(CATALOG, { slot1: { type: "ECHO" } })).toStrictEqual([]);
  });

  it("rejects a sub-model named among the params, where a decoded block never carries it", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { type: "SPLIT", params: { subType: "WIDE" } } });

    expect(issue).toContain("subType");
  });

  it("reports an unknown key and a misplaced param together", () => {
    const [issue] = validateSpec(CATALOG, { slot1: { type: "ECHO", level: 10, bogus: 1 } });

    expect(issue).toContain("bogus");
    expect(issue).toContain("level");
  });

  it("treats a non-object params bag as empty, leaving it to the type check", () => {
    expect(validateSpec(CATALOG, { slot1: { type: "ECHO", params: "nope" } })).toStrictEqual([]);
  });

  it("rejects a block spec that isn't an object, for lacking a type", () => {
    const issues = validateSpec(CATALOG, { slot1: "ECHO" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("type");
  });

  it("rejects a type on a block whose group has none, as an unknown field", () => {
    const issues = validateSpec(CATALOG, { gate: { type: "X" } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"type"');
  });

  it.each([
    { label: "a non-boolean on", block: { type: "ECHO", on: "yes" } },
    { label: "a non-string subType", block: { type: "SPLIT", subType: 42 } },
  ])("rejects $label", ({ block }) => {
    expect(validateSpec(CATALOG, { slot1: block })).toHaveLength(1);
  });

  it("accepts a subType of null, as a decoded block with no variant carries", () => {
    expect(validateSpec(CATALOG, { slot1: { type: "ECHO", subType: null } })).toStrictEqual([]);
  });
});

describe("applyEdits", () => {
  it("writes a patch setting, which belongs to no block", () => {
    const patch = echoPatch();

    expect(edit(patch, { tempo: 140 })).toStrictEqual({ tempo: 140 });
    expect(valueAt(patch, "tempo")).toBe(140);
  });

  it("rejects a patch setting the device cannot store, naming it and its range", () => {
    const patch = echoPatch();

    expect(() => edit(patch, { tempo: 10 })).toThrow(/TEMPO/);
  });

  it("applies a whole batch in order, leaving the fields it was not given alone", () => {
    const patch = echoPatch();
    const levelBefore = slot(patch, "slot2").params;

    edit(patch, { name: "Renamed", "slot1.on": false, "slot1.params.level": 40 });

    expect(patch.name).toBe("Renamed");
    expect(valueAt(patch, "slot1.on")).toBe(false);
    expect(valueAt(patch, "slot1.params.level")).toBe(40);
    expect(slot(patch, "slot2").params).toStrictEqual(levelBefore);
  });

  it("accepts an edit to a block that has no types of its own", () => {
    const patch = echoPatch();

    expect(() => edit(patch, { "gate.params.threshold": 40 })).not.toThrow();
  });

  it.each([
    { path: "slot1.params.level", given: "72", expected: 72 },
    { path: "slot1.params.level", given: "0", expected: 0 },
    { path: "slot1.on", given: "true", expected: true },
    { path: "slot1.on", given: "false", expected: false },
  ])("reads $given into $path as $expected", ({ path, given, expected }) => {
    const patch = echoPatch();

    edit(patch, { [path]: given });

    expect(valueAt(patch, path)).toBe(expected);
  });

  it("writes a named number into a field holding a number", () => {
    const patch = echoPatch();

    edit(patch, { "slot1.params.time": "1/4" });

    expect(valueAt(patch, "slot1.params.time")).toBe("1/4");
  });

  it("keeps a string a string where the field holds text", () => {
    const patch = echoPatch();

    expect(edit(patch, { name: "1984" })).toStrictEqual({ name: "1984" });
  });

  // A field holding one of the catalog's named numbers is still a numeric field, or a control set
  // to a note value could never be set back to a number.
  it("reads a number into a field holding a named number", () => {
    const patch = echoPatch();

    expect(edit(patch, { "slot2.params.time": "40" })).toStrictEqual({ "slot2.params.time": 40 });
  });

  it("takes a value that arrives already typed, not only its string form", () => {
    const patch = echoPatch();

    edit(patch, { "slot1.params.level": 72, "slot1.on": false });

    expect(valueAt(patch, "slot1.params.level")).toBe(72);
    expect(valueAt(patch, "slot1.on")).toBe(false);
  });

  it("rejects an empty string for a numeric field rather than reading it as 0", () => {
    const patch = echoPatch();

    expect(() => edit(patch, { "slot1.params.level": "" })).toThrow(/LEVEL/);
  });

  it("rejects a whitespace-only string the same way", () => {
    const patch = echoPatch();

    expect(() => edit(patch, { "slot1.params.level": "   " })).toThrow(/LEVEL/);
  });

  it("re-seeds a block whose type switches, so the new type's controls can be set in the same batch", () => {
    const patch = echoPatch();

    edit(patch, { "slot1.type": "SPLIT", "slot1.params.width": 7 });

    expect(slot(patch, "slot1")).toMatchObject({ type: "SPLIT", subType: "WIDE", params: { width: 7 } });
    expect(slot(patch, "slot1").params, "the previous type's controls are gone").not.toHaveProperty("level");
  });

  it("leaves a block alone when the type written is the one it already has", () => {
    const patch = echoPatch();

    edit(patch, { "slot1.type": "ECHO" });

    expect(slot(patch, "slot1").params).toMatchObject({ level: 60, mode: "B" });
  });

  it("re-seeds a sub-model that decides which controls the block has", () => {
    const patch = echoPatch();
    edit(patch, { "slot1.type": "SPLIT" });

    edit(patch, { "slot1.subType": "NARROW" });

    expect(slot(patch, "slot1").params).not.toHaveProperty("width");
  });

  it("keeps the controls a sub-model shares with the rest of its type", () => {
    const patch = echoPatch();
    edit(patch, { "slot1.type": "SQUASH", "slot1.params.sustain": 77 });

    edit(patch, { "slot1.subType": "HARD" });

    expect(valueAt(patch, "slot1.params.sustain")).toBe(77);
  });

  it("keeps a block's controls when its types all share one set", () => {
    const patch = echoPatch();

    edit(patch, { "amp.type": "DARK" });

    expect(valueAt(patch, "amp.params.gain")).toBe(40);
  });

  it("leaves a block the batch did not switch alone", () => {
    const patch = echoPatch();

    edit(patch, { "slot1.type": "SPLIT" });

    expect(slot(patch, "slot2").params).toMatchObject({ time: "1/4", level: 60, mode: "A" });
  });

  it("names the fields that do exist when a path misses, and the segment that didn't match", () => {
    const attempt = () => edit(echoPatch(), { "slot1.params.bogus": 1 });

    expect(attempt).toThrow(/level/);
    expect(attempt).toThrow(/bogus/);
  });

  it("rejects a type the block doesn't offer, naming the block that does", () => {
    expect(() => edit(echoPatch(), { "slot1.type": "LOCKED" })).toThrow(/slot2/);
  });

  it("rejects an unknown type, naming it and the types that exist", () => {
    const patch = echoPatch();

    const message = messageFrom(() => edit(patch, { "slot1.type": "NOPE" }));

    expect(message).toContain("NOPE");
    expect(message).toContain("ECHO");
  });

  it("rejects a non-boolean bypass value", () => {
    const patch = echoPatch();

    expect(() => edit(patch, { "slot1.on": 2 })).toThrow(/on/);
  });

  it("reports every rejected edit in one throw", () => {
    const attempt = () => edit(echoPatch(), { "slot1.params.level": 500, tempo: 10 });

    expect(attempt).toThrow(/500/);
    expect(attempt).toThrow(/TEMPO/);
  });

  it("reports a bad path alongside a bad value", () => {
    const patch = echoPatch();

    const message = messageFrom(() => edit(patch, { "slot1.params.bogus": 1, "slot1.params.level": 900 }));

    expect(message.split("\n")).toHaveLength(2);
  });

  it("rejects a control written beside the block's selectors rather than inside params", () => {
    const patch = echoPatch();

    const message = messageFrom(() => edit(patch, { "slot1.level": 1 }));

    expect(message).toContain("level");
  });

  it("rejects an unknown top-level field, leaving the patch as it was", () => {
    const patch = echoPatch();

    expect(() => edit(patch, { setName: "x" })).toThrow();
    expect("setName" in patch).toBe(false);
  });

  it("rejects a path walking through a block the device doesn't have", () => {
    expect(() => edit(echoPatch(), { "nope.params.rate": 1 })).toThrow();
  });

  it("rejects a path reaching past a value that holds no fields", () => {
    const message = messageFrom(() => edit(echoPatch(), { "slot1.params.level.deeper": 1 }));

    expect(message).toContain("slot1.params.level");
  });

  it("rejects a string where the param takes a number, naming the param", () => {
    const message = messageFrom(() => edit(echoPatch(), { "slot1.params.level": "abc" }));

    expect(message).toContain("LEVEL");
    expect(message).toContain("abc");
  });

  it("rejects a control of the type the block was switched away from", () => {
    expect(() => edit(echoPatch(), { "slot1.type": "SPLIT", "slot1.params.level": 30 })).toThrow(/level/);
  });

  it("rejects a control of the new type named before the type that has it", () => {
    expect(() => edit(echoPatch(), { "slot1.params.width": 7, "slot1.type": "SPLIT" })).toThrow(/width/);
  });

  it("leaves a block un-reseeded when the type edit lands on a block it can't hold", () => {
    const patch = echoPatch();
    const before = { ...(slot(patch, "slot1").params as Record<string, unknown>) };

    expect(() => edit(patch, { "slot1.type": "LOCKED" })).toThrow();
    expect(slot(patch, "slot1").params).toStrictEqual(before);
  });

  it("does not throw when the builder refuses a re-seed, leaving the block's old controls in place", () => {
    const patch = echoPatch();
    const before = { ...(slot(patch, "slot1").params as Record<string, unknown>) };

    edit(patch, { "slot1.type": "BROKEN" });

    expect(slot(patch, "slot1").type).toBe("BROKEN");
    expect(slot(patch, "slot1").params).toStrictEqual(before);
  });

  it("does not re-seed when a subType edit writes back the value the block already has", () => {
    const patch = echoPatch();
    edit(patch, { "slot1.type": "SPLIT", "slot1.params.width": 7 });

    edit(patch, { "slot1.subType": "WIDE" });

    expect(valueAt(patch, "slot1.params.width")).toBe(7);
  });

  it("rejects an unknown subType edit, listing the variants that exist", () => {
    const patch = echoPatch();
    edit(patch, { "slot1.type": "SPLIT" });

    expect(() => edit(patch, { "slot1.subType": "TALL" })).toThrow(/WIDE/);
  });

  it("rejects a subType edit that isn't a string", () => {
    const patch = echoPatch();
    edit(patch, { "slot1.type": "SPLIT" });

    expect(() => edit(patch, { "slot1.subType": 42 })).toThrow();
  });

  it("returns an empty object for an empty edit list", () => {
    expect(edit(echoPatch(), {})).toStrictEqual({});
  });
});
