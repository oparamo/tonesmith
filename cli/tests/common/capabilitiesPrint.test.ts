import { describe, it, expect, vi } from "vitest";
import type {
  CapabilityGroup, CapabilityType, ChainView, DeviceCapabilities, DiscreteParam, NumericOrNamedParam,
  NumericParam,
} from "@tonesmith/core";
import { printChain, printGroups, printGroup, printType } from "../../src/common/capabilitiesPrint";

const printed = (act: () => void): string => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  act();
  const output = info.mock.calls.map(call => String(call[0] ?? "")).join("\n");
  info.mockRestore();
  return output;
};

const paramBase = { range: "0-100", description: "What it does." };

const numericParam = (overrides: Partial<NumericParam> = {}): NumericParam =>
  ({ kind: "numeric", name: "Level", min: 0, max: 100, ...paramBase, ...overrides });

const discreteParam = (overrides: Partial<DiscreteParam> = {}): DiscreteParam =>
  ({ kind: "discrete", name: "Mode", values: ["A", "B"], ...paramBase, ...overrides });

const numericOrNamedParam = (overrides: Partial<NumericOrNamedParam> = {}): NumericOrNamedParam =>
  ({ kind: "numericOrNamed", name: "Time", min: 0, max: 100, values: ["OFF", "TAP"], ...paramBase, ...overrides });

const capType = (overrides: Partial<CapabilityType> = {}): CapabilityType =>
  ({ id: "TYPE-A", name: "Type A", description: "What it sounds like.", ...overrides });

const group = (overrides: Partial<CapabilityGroup> = {}): CapabilityGroup =>
  ({ id: "fx", name: "Effects", description: "The effects block.", types: [], ...overrides });

const chainView = (overrides: Partial<ChainView> = {}): ChainView => ({
  description: "How the chain works.",
  defaultOrder: ["amp", "delay"],
  blocks: {
    amp: { label: "AMP", group: "amp", bypass: false },
    delay: { label: "DLY", group: "delay", bypass: true },
  },
  patchName: { maxLength: 16 },
  patchSettings: [],
  ...overrides,
});

describe("printChain", () => {
  it("prints the default order", () => {
    const output = printed(() => { printChain(chainView({ defaultOrder: ["amp", "delay"] })); });

    expect(output).toContain("amp → delay");
  });

  it("prints the patch name limit", () => {
    const output = printed(() => { printChain(chainView({ patchName: { maxLength: 42 } })); });

    expect(output).toContain("42");
  });

  it("lists each patch setting with its key", () => {
    const setting = numericParam({ name: "Tempo", key: "tempo" });

    const output = printed(() => { printChain(chainView({ patchSettings: [setting] })); });

    const line = output.split("\n").find(line => line.includes("Tempo"));
    expect(line).toContain("tempo");
  });

  it("prints no settings heading when patchSettings is empty", () => {
    const output = printed(() => { printChain(chainView({ patchSettings: [] })); });

    expect(output).not.toContain("Patch settings:");
  });

  it("tags a block with bypass: false as always on, and one with bypass: true as not", () => {
    const view = chainView({
      blocks: {
        amp: { label: "AMP", group: "amp", bypass: false },
        delay: { label: "DLY", group: "delay", bypass: true },
      },
    });

    const output = printed(() => { printChain(view); });

    const ampLine = output.split("\n").find(line => line.includes("AMP"));
    const delayLine = output.split("\n").find(line => line.includes("DLY"));
    expect(ampLine).toContain("always on");
    expect(delayLine).not.toContain("always on");
  });

  it("each block line carries its name, label and group", () => {
    const view = chainView({ blocks: { pedal: { label: "PDL", group: "pedalfx", bypass: false } } });

    const output = printed(() => { printChain(view); });

    expect(output).toContain("pedal");
    expect(output).toContain("PDL");
    expect(output).toContain("group pedalfx");
  });
});

describe("printGroups", () => {
  const caps: DeviceCapabilities = {
    chain: { description: "The chain.", defaultOrder: ["amp", "fx"], blocks: {} },
    patchName: { maxLength: 16 },
    patchSettings: [],
    groups: [
      group({ id: "amp", types: [capType()] }),
      group({ id: "fx", types: [] }),
    ],
  };

  it.each(caps.groups.map(g => g.id))("lists group id %s", (id) => {
    const output = printed(() => { printGroups(caps); });

    expect(output).toContain(id);
  });

  it("leads the listing with the chain and its default order", () => {
    const output = printed(() => { printGroups(caps); });

    expect(output).toContain("amp → fx");
    expect(output.indexOf("chain")).toBeLessThan(output.indexOf("The effects block."));
  });

  it("shows a group's type count, and 'no types' for one with none", () => {
    const output = printed(() => { printGroups(caps); });

    const ampLine = output.split("\n").find(line => line.includes("(1 types)"));
    const fxLine = output.split("\n").find(line => line.includes("(no types)"));
    expect(ampLine).toBeDefined();
    expect(fxLine).toBeDefined();
  });
});

describe("printGroup", () => {
  it("lists each type id", () => {
    const g = group({ types: [capType({ id: "TYPE-A" }), capType({ id: "TYPE-B" })] });

    const output = printed(() => { printGroup(g); });

    expect(output).toContain("TYPE-A");
    expect(output).toContain("TYPE-B");
  });

  it("prints a typeless group's block controls", () => {
    const control = numericParam({ name: "Threshold", key: "threshold" });
    const g = group({ types: [], params: [control] });

    const output = printed(() => { printGroup(g); });

    const line = output.split("\n").find(line => line.includes("Threshold"));
    expect(line).toContain("threshold");
  });

  it("prints no block-controls heading when params is undefined or empty", () => {
    const withoutParams = printed(() => { printGroup(group({ params: undefined })); });
    const withEmptyParams = printed(() => { printGroup(group({ params: [] })); });

    expect(withoutParams).not.toContain("Block controls:");
    expect(withEmptyParams).not.toContain("Block controls:");
  });

  it("prints a typeless group's example, and nothing when it has none", () => {
    const withExample = printed(() => { printGroup(group({ types: [], example: { foo: 1 } })); });
    const withoutExample = printed(() => { printGroup(group({ types: [], example: undefined })); });

    expect(withExample).toContain('"foo": 1');
    expect(withoutExample).not.toContain("Spec at factory defaults:");
  });

  it("prints a type's subtype ids only when it has subtypes", () => {
    const withSubtypes = printed(() => { printGroup(group({
      types: [capType({ subTypes: [capType({ id: "SUB-A" })] })],
    })); });
    const withoutSubtypes = printed(() => { printGroup(group({ types: [capType({ subTypes: [] })] })); });
    const undefinedSubtypes = printed(() => { printGroup(group({ types: [capType({ subTypes: undefined })] })); });

    expect(withSubtypes).toContain("Subtypes: SUB-A");
    expect(withoutSubtypes).not.toContain("Subtypes:");
    expect(undefinedSubtypes).not.toContain("Subtypes:");
  });

  it("tags a type's models only when models is set", () => {
    const withModels = printed(() => { printGroup(group({ types: [capType({ models: "Fender Twin" })] })); });
    const withoutModels = printed(() => { printGroup(group({ types: [capType({ models: undefined })] })); });

    expect(withModels).toContain("models: Fender Twin");
    expect(withoutModels).not.toContain("models:");
  });
});

describe("printType", () => {
  it("lists each subtype id", () => {
    const type = capType({ subTypes: [capType({ id: "SUB-A" }), capType({ id: "SUB-B" })] });

    const output = printed(() => { printType(group(), type); });

    expect(output).toContain("SUB-A");
    expect(output).toContain("SUB-B");
  });

  it("tags a subtype with its models", () => {
    const type = capType({ subTypes: [capType({ id: "SUB-A", models: "Fender Twin" })] });

    const output = printed(() => { printType(group(), type); });

    expect(output).toContain("models: Fender Twin");
  });

  it("prints a subtype's params after that subtype's line", () => {
    const depth = numericParam({ name: "Depth" });
    const type = capType({ subTypes: [capType({ id: "SUB-A", params: [depth] })] });

    const output = printed(() => { printType(group(), type); });

    expect(output.indexOf("SUB-A")).toBeLessThan(output.indexOf("Depth"));
  });

  it("shows the Models line only when models is set", () => {
    const withModels = printed(() => { printType(group(), capType({ models: "Fender Twin" })); });
    const withoutModels = printed(() => { printType(group(), capType({ models: undefined })); });

    expect(withModels).toContain("Models: Fender Twin");
    expect(withoutModels).not.toContain("Models:");
  });

  it("prints no Subtypes section when there are none", () => {
    const withoutSubtypes = printed(() => { printType(group(), capType({ subTypes: undefined })); });
    const withEmptySubtypes = printed(() => { printType(group(), capType({ subTypes: [] })); });

    expect(withoutSubtypes).not.toContain("Subtypes:");
    expect(withEmptySubtypes).not.toContain("Subtypes:");
  });

  it("prints no Parameters section when params is empty", () => {
    const withoutParams = printed(() => { printType(group(), capType({ params: undefined })); });
    const withEmptyParams = printed(() => { printType(group(), capType({ params: [] })); });

    expect(withoutParams).not.toContain("Parameters:");
    expect(withEmptyParams).not.toContain("Parameters:");
  });

  it("prints each param's description line", () => {
    const param = numericParam({ description: "Distinct description text." });

    const output = printed(() => { printType(group(), capType({ params: [param] })); });

    expect(output).toContain("Distinct description text.");
  });

  // `range` is only a summary for a lookup param; `values` carries the exact labels.
  it.each([
    ["discrete", discreteParam({ values: ["FLAT", "2.5kHz"] })],
    ["numericOrNamed", numericOrNamedParam({ values: ["OFF", "TAP"] })],
  ] as const)("lists every value of a %s param", (_, param) => {
    const output = printed(() => { printType(group(), capType({ params: [param] })); });

    expect(output).toContain(`Values: ${param.values.join(", ")}`);
  });

  it("prints no Values line for a continuous, range-only param", () => {
    const output = printed(() => { printType(group(), capType({ params: [numericParam()] })); });

    expect(output).not.toContain("Values:");
  });

  it("prints the example as JSON, and omits it when absent", () => {
    const withExample = printed(() => { printType(group(), capType({ example: { foo: "bar" } })); });
    const withoutExample = printed(() => { printType(group(), capType({ example: undefined })); });

    expect(withExample).toContain('"foo": "bar"');
    expect(withoutExample).not.toContain("Spec at factory defaults:");
  });

  it("prints a param's key on the same line as its name", () => {
    const param = numericParam({ name: "Pre-Delay", key: "preDelay" });

    const output = printed(() => { printType(group(), capType({ params: [param] })); });

    const line = output.split("\n").find(line => line.includes("Pre-Delay"));
    expect(line).toContain("preDelay");
  });

  // HARMONIST's KEY is the real-world case: a param that reads a patch-level field rather than a
  // codec field of its own has no write key, and must still be listed.
  it("prints a param with no key by name alone", () => {
    const keyless = numericParam({ name: "Wet/Dry", key: undefined });

    const output = printed(() => { printType(group(), capType({ params: [keyless] })); });

    const line = output.split("\n").find(line => line.includes("Wet/Dry"));
    expect(line?.trimEnd().endsWith("0-100")).toBe(true);
  });
});
