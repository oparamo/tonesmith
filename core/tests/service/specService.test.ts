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

const numeric = (key: string, [min, max]: [number, number], decimals?: number): ParamSpec =>
  ({ key, name: key.toUpperCase(), range: `${min}-${max}`, description: "", kind: "numeric", min, max, decimals });

const discrete = (key: string, name: string, values: string[]): ParamSpec =>
  ({ key, name, range: values.join(", "), description: "", kind: "discrete", values });

const TIME: ParamSpec = {
  key: "time", name: "TIME", range: "0-100, 1/4, 1/8", description: "",
  kind: "numericOrNamed", min: 0, max: 100, values: ["1/4", "1/8"],
};

const type = (id: string, extra: object = {}) => ({ id, name: id, description: "", ...extra });

/**
 * Two copies of one effect slot sharing the `fx` group, and a gate the device keeps on at all times.
 * The fx group covers the shapes the checks branch on: a type with named-number params, a type with
 * sub-models that bring their own params, a type only one slot offers, and a type whose variant is
 * an ordinary param labeled TYPE.
 */
const CATALOG: DeviceCapabilities = {
  chain: {
    description: "",
    defaultOrder: ["slot1", "slot2", "gate"],
    blocks: {
      slot1: { label: "S1", group: "fx", bypass: true },
      slot2: { label: "S2", group: "fx", bypass: true },
      gate: { label: "G", group: "gate", bypass: false },
    },
  },
  patchName: { maxLength: 8 },
  patchSettings: [numeric("tempo", [40, 250]), numeric("trim", [-6, 6], 1)],
  groups: [
    {
      id: "fx", name: "FX", description: "",
      types: [
        type("ECHO", { params: [TIME, numeric("level", [0, 100]), discrete("mode", "MODE", ["A", "B"])] }),
        type("SPLIT", { subTypes: [type("WIDE", { params: [numeric("width", [0, 10])] }), type("NARROW")] }),
        type("LOCKED", { blocks: ["slot2"], params: [numeric("depth", [0, 100])] }),
        type("PLAIN", { params: [discrete("variant", "TYPE", ["SOFT", "HARD"])] }),
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
  LOCKED: { depth: 20 },
  PLAIN: { variant: "SOFT" },
};

/** Builds only the blocks a spec names, at factory settings, which is all a re-seed reads back. */
const buildPatch = (spec: unknown): Patch => {
  const { name, ...blocks } = spec as Record<string, Record<string, unknown>>;
  const built = Object.fromEntries(Object.entries(blocks).map(([block, input]) => {
    const factorySubType = input.type === "SPLIT" ? "WIDE" : null;
    const subType = (input.subType as string | undefined) ?? factorySubType;
    const controls = FACTORY[subType ?? (input.type as string)] ?? {};
    return [block, { on: input.on ?? true, type: input.type, subType, params: { ...controls } }];
  }));
  return { name: name as unknown as string, ...built };
};

const DEVICE: EditingDevice = { capabilities: CATALOG, buildPatch };

const echoPatch = (): Patch => ({
  name: "Test",
  tempo: 120,
  slot1: { on: true, type: "ECHO", subType: null, params: { time: 40, level: 60, mode: "B" } },
  slot2: { on: false, type: "ECHO", subType: null, params: { time: "1/4", level: 60, mode: "A" } },
  gate: { params: { threshold: 30 } },
} as Patch);

const edit = (patch: Patch, edits: Record<string, FieldValue>) => applyEdits(DEVICE, patch, Object.entries(edits));

const slot = (patch: Patch, name: string) => (patch as unknown as Record<string, Record<string, unknown>>)[name];

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

  // A variant carried as an ordinary param encodes nowhere when sent as a subType, so the rejection
  // has to name the param that does carry it.
  it("points a sub-model on a type without any at the param labeled TYPE", () => {
    const [issue] = validateTypeParams(CATALOG, { group: "fx", type: "PLAIN", subType: "SOFT", values: {} });

    expect(issue).toContain("params.variant");
  });
});

describe("validatePatchSettings", () => {
  it("checks the settings a spec carries and skips every other key", () => {
    const issues = validatePatchSettings(CATALOG, { tempo: 300, trim: 1.5, slot1: { type: "ECHO" } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("300");
  });

  it("takes a fraction only where the param has decimals", () => {
    expect(validatePatchSettings(CATALOG, { trim: 2.5 })).toStrictEqual([]);
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

    expect(issue).toContain("on");
  });

  it("reports every problem at once", () => {
    const spec = { tempo: 10, slot1: { type: "ECHO", params: { level: 500, mode: "C" } } };

    expect(validateSpec(CATALOG, spec)).toHaveLength(3);
  });
});

describe("applyEdits", () => {
  it("reads a string as the number a numeric field holds", () => {
    const patch = echoPatch();

    expect(edit(patch, { "slot1.params.level": "75" })).toStrictEqual({ "slot1.params.level": 75 });
    expect(slot(patch, "slot1")?.params).toMatchObject({ level: 75 });
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

  it("re-seeds a block whose type switches, so the new type's controls can be set in the same batch", () => {
    const patch = echoPatch();

    edit(patch, { "slot1.type": "SPLIT", "slot1.params.width": 7 });

    expect(slot(patch, "slot1")).toMatchObject({ type: "SPLIT", subType: "WIDE", params: { width: 7 } });
    expect(slot(patch, "slot1")?.params, "the previous type's controls are gone").not.toHaveProperty("level");
  });

  it("leaves a block alone when the type written is the one it already has", () => {
    const patch = echoPatch();

    edit(patch, { "slot1.type": "ECHO" });

    expect(slot(patch, "slot1")?.params).toMatchObject({ level: 60, mode: "B" });
  });

  it("names the fields that do exist when a path misses", () => {
    expect(() => edit(echoPatch(), { "slot1.params.bogus": 1 })).toThrow(/level/);
  });

  it("rejects a type the block doesn't offer, naming the block that does", () => {
    expect(() => edit(echoPatch(), { "slot1.type": "LOCKED" })).toThrow(/slot2/);
  });

  it("reports every rejected edit in one throw", () => {
    const attempt = () => edit(echoPatch(), { "slot1.params.level": 500, tempo: 10 });

    expect(attempt).toThrow(/500/);
    expect(attempt).toThrow(/TEMPO/);
  });
});
