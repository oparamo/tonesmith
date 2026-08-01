import { describe, it, expect } from "vitest";
import { capabilityItemIds, capabilityParamValues } from "../src/devices/gx1/capability-text";

describe("capabilityItemIds", () => {
  it("lists every item id in a group, comma-separated", () => {
    const ids = capabilityItemIds("mic");

    expect(ids).toContain("DYN57");
    expect(ids).toContain("BLEND C");
    expect(ids.split(", ")).toHaveLength(9);
  });
});

describe("capabilityParamValues", () => {
  it("reads a group-level param's discrete values off its ParamSpec", () => {
    expect(capabilityParamValues("ns", "DETECT")).toBe("INPUT, NS INPUT");
    expect(capabilityParamValues("fv", "CURVE")).toBe("SLOW1, SLOW2, NORMAL, FAST");
  });

  it("reads a per-type param's values via the representative type", () => {
    const values = capabilityParamValues("delay", "HIGH CUT", "STANDARD");

    expect(values).toContain("FLAT");
    expect(values).toContain("3.15kHz");
  });

  it("throws for a numeric group-level param rather than describing it as a value list", () => {
    const lookup = (): string => capabilityParamValues("amp", "GAIN");

    expect(lookup).toThrow();
  });

  it("throws for a numeric per-type param", () => {
    const lookup = (): string => capabilityParamValues("delay", "FEEDBACK", "STANDARD");

    expect(lookup).toThrow();
  });
});
