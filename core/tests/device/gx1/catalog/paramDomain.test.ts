import { describe, it, expect } from "vitest";
import { num, oneOf, lookupOf, bool, orNotes, def, rangeText } from "../../../../src/device/gx1/catalog/paramDomain";

// rangeText's output is the param's own `range` string, shown to an agent verbatim, so asserting it
// is asserting data (matches the device's own parameter-guide wording), not agent prose.
describe("rangeText", () => {
  it("joins an enum's values with a comma", () => {
    expect(rangeText(oneOf("SLOW", "FAST"))).toBe("SLOW, FAST");
  });

  it("renders a boolean as true, false", () => {
    expect(rangeText(bool())).toBe("true, false");
  });

  it("renders a lookup as its own display string", () => {
    expect(rangeText(lookupOf(["A", "B"], "A custom display"))).toBe("A custom display");
  });

  it("renders a plain range as min-max", () => {
    expect(rangeText(num(0, 100))).toBe("0-100");
  });

  it("prefixes a positive max with + when the range crosses zero", () => {
    expect(rangeText(num(-24, 24))).toBe("-24-+24");
  });

  it("gives no + on the max when the range ends exactly at zero", () => {
    expect(rangeText(num(-12, 0, { unit: "semitones" }))).toBe("-12-0 semitones");
  });

  it("appends a percent sign", () => {
    expect(rangeText(num(0, 100, { percent: true }))).toBe("0-100%");
  });

  it("appends a unit", () => {
    expect(rangeText(num(1, 2000, { unit: "ms" }))).toBe("1-2000 ms");
  });

  it("fixes decimal places", () => {
    expect(rangeText(num(0.1, 10, { unit: "s", decimals: 1 }))).toBe("0.1-10.0 s");
  });

  it("appends the note range's first and last values to the numeric interval", () => {
    const domain = orNotes(num(0, 100), ["1/32", "1/16T", "2/1"]);

    expect(rangeText(domain)).toBe("0-100, or a note value from 1/32 to 2/1");
  });
});

describe("def", () => {
  it("builds a boolean param with no values", () => {
    const spec = def("trigger", bool(), "on/off");

    expect(spec).toStrictEqual({ name: "trigger", range: "true, false", description: "on/off", kind: "boolean" });
  });

  it("builds a discrete param from an enum, carrying its values", () => {
    const spec = def("speed", oneOf("SLOW", "FAST"), "rotary speed");

    expect(spec).toStrictEqual({
      name: "speed", range: "SLOW, FAST", description: "rotary speed", kind: "discrete", values: ["SLOW", "FAST"],
    });
  });

  it("builds a discrete param from a lookup, carrying its values", () => {
    const spec = def("highCut", lookupOf(["1kHz", "2kHz"], "1-2 kHz"), "cutoff");

    expect(spec).toStrictEqual({
      name: "highCut", range: "1-2 kHz", description: "cutoff", kind: "discrete", values: ["1kHz", "2kHz"],
    });
  });

  it("builds a numericOrNamed param from a notes domain, carrying min, max, and values", () => {
    const spec = def("time", orNotes(num(0, 2000, { unit: "ms" }), ["1/32", "2/1"]), "delay time");

    expect(spec).toStrictEqual({
      name: "time", range: "0-2000 ms, or a note value from 1/32 to 2/1", description: "delay time",
      kind: "numericOrNamed", min: 0, max: 2000, values: ["1/32", "2/1"],
    });
  });

  it("builds a numeric param from a range, carrying min and max", () => {
    const spec = def("gain", num(0, 100), "gain");

    expect(spec).toStrictEqual({ name: "gain", range: "0-100", description: "gain", kind: "numeric", min: 0, max: 100 });
  });

  it("carries decimals only when the domain sets it, as an absent key rather than undefined", () => {
    const spec = def("gain", num(0, 100), "gain");

    expect(spec).not.toHaveProperty("decimals");
  });

  it("carries decimals when the domain sets it", () => {
    const spec = def("time", num(0.1, 10, { decimals: 1 }), "time");

    expect(spec).toMatchObject({ decimals: 1 });
  });
});

describe("orNotes", () => {
  it("keeps the range's min, max, and unit", () => {
    const domain = orNotes(num(0, 2000, { unit: "ms" }), ["1/32", "2/1"]);

    expect(domain).toMatchObject({ min: 0, max: 2000, unit: "ms" });
  });

  it("is kind notes", () => {
    const domain = orNotes(num(0, 2000), ["1/32", "2/1"]);

    expect(domain.kind).toBe("notes");
  });
});
