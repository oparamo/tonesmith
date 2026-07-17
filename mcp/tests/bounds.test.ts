import { describe, it, expect } from "vitest";
import { parseNumericRange, rangeFor, boundedNumber, boundedInt } from "../src/devices/gx1/bounds";

describe("parseNumericRange", () => {
  it.each([
    { range: "0-100", min: 0, max: 100 },
    { range: "1-120", min: 1, max: 120 },
    { range: "-50-+50", min: -50, max: 50 },
    { range: "1-2000 ms, BPM", min: 1, max: 2000 },
    { range: "0.1-10.0 s", min: 0.1, max: 10 },
    { range: "0-200 ms", min: 0, max: 200 },
  ])("reads the numeric endpoints out of \"$range\"", ({ range, min, max }) => {
    const parsed = parseNumericRange(range);

    expect(parsed).toEqual({ min, max });
  });

  it("throws on a non-numeric (enum) range rather than yielding a silent unbounded number", () => {
    const parse = (): { min: number; max: number } => parseNumericRange("LPF, BPF, HPF");

    expect(parse).toThrow(/not a numeric min-max range/);
  });
});

describe("rangeFor", () => {
  it("resolves a group-level param's range", () => {
    const range = rangeFor("amp", "GAIN");

    expect(range).toBe("0-120");
  });

  it("resolves a per-type param's range via the representative type", () => {
    const range = rangeFor("reverb", "LEVEL", "HALL S");

    expect(range).toBe("1-100");
  });

  it("throws when the param name doesn't exist on the group", () => {
    const lookup = (): string => rangeFor("amp", "NOPE");

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
