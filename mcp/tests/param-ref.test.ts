import { describe, it, expect } from "vitest";
import { boundsFor, boundedNumber, boundedInt, describeParam, paramFor } from "../src/devices/gx1/param-ref";

describe("boundsFor", () => {
  it("reads a group-level param's numeric bounds off its ParamSpec", () => {
    expect(boundsFor({ group: "amp", param: "GAIN" })).toEqual({ min: 0, max: 120 });
  });

  it("reads a per-type param's bounds via the representative type", () => {
    expect(boundsFor({ group: "reverb", param: "LEVEL", type: "HALL S" })).toEqual({ min: 1, max: 100 });
    expect(boundsFor({ group: "delay", param: "TIME", type: "STANDARD" })).toEqual({ min: 1, max: 2000 });
  });

  it("throws for a non-numeric (enum) group param rather than yielding a silent unbounded number", () => {
    const lookup = (): { min: number; max: number } => boundsFor({ group: "fv", param: "CURVE" });

    expect(lookup).toThrow(/group "fv" has no numeric bounds/);
  });

  it("throws for a non-numeric per-type param, naming the type", () => {
    const lookup = (): { min: number; max: number } => boundsFor({ group: "delay", param: "TRIGGER", type: "REVERSE" });

    expect(lookup).toThrow(/delay type "REVERSE" has no numeric bounds/);
  });

  it("throws when the param name doesn't exist on the group", () => {
    const lookup = (): { min: number; max: number } => boundsFor({ group: "amp", param: "NOPE" });

    expect(lookup).toThrow(/No ParamSpec "NOPE"/);
  });
});

describe("boundedNumber / boundedInt", () => {
  it("boundedNumber accepts fractional values within the catalog range", () => {
    const schema = boundedNumber({ group: "reverb", param: "TIME", type: "HALL S" });

    expect(schema.safeParse(2.4).success).toBe(true);
    expect(schema.safeParse(0.05).success).toBe(false);
  });

  it("boundedInt rejects non-integers and out-of-range values", () => {
    const schema = boundedInt({ group: "amp", param: "GAIN" });

    expect(schema.safeParse(60).success).toBe(true);
    expect(schema.safeParse(60.5).success).toBe(false);
    expect(schema.safeParse(121).success).toBe(false);
  });

  it("carries the catalog description onto the schema", () => {
    const ref = { group: "amp", param: "GAIN" };

    expect(boundedInt(ref).description).toBe(describeParam(ref));
  });
});

// These compare against the catalog's own strings rather than literals, so rewording a param
// description in the catalog can't break them. What they pin is the wiring: that the text an agent
// reads is sourced from the catalog rather than typed beside the schema field.
describe("describeParam", () => {
  it("states the catalog's description and range for a numeric param", () => {
    const ref = { group: "amp", param: "GAIN" };
    const spec = paramFor(ref);

    const described = describeParam(ref);

    expect(described).toContain(spec.description);
    expect(described).toContain(spec.range);
  });

  it("resolves the range through the representative type for a per-type param", () => {
    const ref = { group: "delay", param: "TIME", type: "STANDARD" };

    expect(describeParam(ref)).toContain(paramFor(ref).range);
  });

  it("appends the note, which the catalog has no opinion on", () => {
    const note = "Defaults to 100.";

    expect(describeParam({ group: "amp", param: "LEVEL", note })).toContain(note);
  });

  it("omits the range for a param whose values aren't a numeric interval", () => {
    const ref = { group: "amp", param: "SOLO" };

    expect(describeParam(ref)).toBe(paramFor(ref).description);
  });
});
