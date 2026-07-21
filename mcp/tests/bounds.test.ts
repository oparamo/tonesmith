import { describe, it, expect } from "vitest";
import { boundsFor, boundedNumber, boundedInt } from "../src/devices/gx1/bounds";

describe("boundsFor", () => {
  it("reads a group-level param's numeric bounds off its ParamSpec", () => {
    expect(boundsFor("amp", "GAIN")).toEqual({ min: 0, max: 120 });
  });

  it("reads a per-type param's bounds via the representative type", () => {
    expect(boundsFor("reverb", "LEVEL", "HALL S")).toEqual({ min: 1, max: 100 });
    expect(boundsFor("delay", "TIME", "STANDARD")).toEqual({ min: 1, max: 2000 });
  });

  it("throws for a non-numeric (enum) group param rather than yielding a silent unbounded number", () => {
    const lookup = (): { min: number; max: number } => boundsFor("fv", "CURVE");

    expect(lookup).toThrow(/group "fv" has no numeric bounds/);
  });

  it("throws for a non-numeric per-type param, naming the type", () => {
    const lookup = (): { min: number; max: number } => boundsFor("delay", "TRIGGER", "REVERSE");

    expect(lookup).toThrow(/delay type "REVERSE" has no numeric bounds/);
  });

  it("throws when the param name doesn't exist on the group", () => {
    const lookup = (): { min: number; max: number } => boundsFor("amp", "NOPE");

    expect(lookup).toThrow(/No ParamSpec "NOPE"/);
  });
});

describe("boundedNumber / boundedInt", () => {
  it("boundedNumber accepts fractional values within the catalog range", () => {
    const schema = boundedNumber("reverb", "TIME", "HALL S");

    expect(schema.safeParse(2.4).success).toBe(true);
    expect(schema.safeParse(0.05).success).toBe(false);
  });

  it("boundedInt rejects non-integers and out-of-range values", () => {
    const schema = boundedInt("amp", "GAIN");

    expect(schema.safeParse(60).success).toBe(true);
    expect(schema.safeParse(60.5).success).toBe(false);
    expect(schema.safeParse(121).success).toBe(false);
  });
});
