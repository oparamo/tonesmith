import { describe, it, expect } from "vitest";
import {
  u8, signed, lookup, scaled, nibblePair, nibbleQuad, namedAbove, syncedTime, syncedRate, encodeFields,
} from "../../../src/devices/gx1/codec/fields";
import { TIME_NOTE_VALUES, RATE_NOTE_VALUES } from "../../../src/devices/gx1/common";

describe("u8", () => {
  const field = u8("gain", 0);

  it("decodes the raw byte unchanged", () => {
    const decoded = field.decode([42]);

    expect(decoded).toBe(42);
  });

  it("encodes a value in range", () => {
    const bytes = [0];

    field.encode(50, bytes);

    expect(bytes).toEqual([50]);
  });

  it("throws when encoding a value below 0", () => {
    const encodeBelowRange = () => { field.encode(-1, [0]); };

    expect(encodeBelowRange).toThrow(RangeError);
  });

  it("throws when encoding a value above 255", () => {
    const encodeAboveRange = () => { field.encode(256, [0]); };

    expect(encodeAboveRange).toThrow(RangeError);
  });
});

describe("signed", () => {
  const field = signed("gain", 0, 20);

  it("decodes the byte as an offset from the center", () => {
    expect(field.decode([30])).toBe(10);
    expect(field.decode([0])).toBe(-20);
  });

  it("encodes both ends of the range the center allows", () => {
    const low = [0];
    const high = [0];

    field.encode(-20, low);
    field.encode(235, high);

    expect(low).toEqual([0]);
    expect(high).toEqual([255]);
  });

  it.each([
    { label: "a value below the center", value: -21 },
    { label: "a value whose stored byte exceeds 255", value: 236 },
    { label: "a fraction", value: 1.5 },
    { label: "a string", value: "abc" },
  ])("throws for $label", ({ value }) => {
    const encodeBadValue = () => { field.encode(value, [0]); };

    expect(encodeBadValue).toThrow(RangeError);
    expect(encodeBadValue).toThrow(/gain/);
  });
});

describe("scaled", () => {
  const field = scaled("time", 0, 0.1);

  it("decodes the byte multiplied by the factor", () => {
    expect(field.decode([45])).toBe(4.5);
  });

  it("encodes a fractional value, which is the point of the factor", () => {
    const bytes = [0];

    field.encode(4.5, bytes);

    expect(bytes).toEqual([45]);
  });

  it.each([
    { label: "a value past the top of the scaled range", value: 25.6 },
    { label: "a negative", value: -0.1 },
    { label: "a string", value: "abc" },
  ])("throws for $label", ({ value }) => {
    const encodeBadValue = () => { field.encode(value, [0]); };

    expect(encodeBadValue).toThrow(RangeError);
    expect(encodeBadValue).toThrow(/time/);
  });
});

describe("nibblePair", () => {
  const field = nibblePair("preDelay", 0);

  it("round-trips a value through its two nibbles", () => {
    const bytes = [0, 0];

    field.encode(200, bytes);

    expect(bytes).toEqual([12, 8]);
    expect(field.decode(bytes)).toBe(200);
  });

  it.each([
    { label: "a value wider than its two nibbles", value: 256 },
    { label: "a negative", value: -1 },
    { label: "a fraction", value: 1.5 },
    { label: "a string", value: "abc" },
  ])("throws for $label", ({ value }) => {
    const encodeBadValue = () => { field.encode(value, [0, 0]); };

    expect(encodeBadValue).toThrow(RangeError);
    expect(encodeBadValue).toThrow(/preDelay/);
  });
});

describe("nibbleQuad", () => {
  const field = nibbleQuad("time", 0);

  it("round-trips a value through its four nibbles", () => {
    const bytes = [0, 0, 0, 0];

    field.encode(2000, bytes);

    expect(bytes).toEqual([0, 7, 13, 0]);
    expect(field.decode(bytes)).toBe(2000);
  });

  it.each([
    { label: "a value wider than its four nibbles", value: 65536 },
    { label: "a negative", value: -1 },
    { label: "a fraction", value: 1.5 },
    { label: "a string", value: "abc" },
  ])("throws for $label", ({ value }) => {
    const encodeBadValue = () => { field.encode(value, [0, 0, 0, 0]); };

    expect(encodeBadValue).toThrow(RangeError);
    expect(encodeBadValue).toThrow(/time/);
  });
});

describe("lookup", () => {
  const field = lookup("type", 0, ["ALPHA", "BETA"]);

  it("decodes a known index to its name", () => {
    const decoded = field.decode([1]);

    expect(decoded).toBe("BETA");
  });

  it("encodes a known name to its index", () => {
    const bytes = [0];

    field.encode("BETA", bytes);

    expect(bytes).toEqual([1]);
  });

  it("throws when encoding a name not in the table", () => {
    const encodeUnknownName = () => { field.encode("GAMMA", [0]); };

    expect(encodeUnknownName, "names the value it refused").toThrow(/GAMMA/);
    expect(encodeUnknownName, "and the field it refused it for").toThrow(/type/);
  });
});

describe("encodeFields", () => {
  it("only writes fields present in the params object, leaving the rest of the byte array untouched", () => {
    const fields = [u8("gain", 0), u8("level", 1)];
    const bytes = [10, 20];

    encodeFields(fields, { gain: 99 }, bytes);

    expect(bytes).toEqual([99, 20]);
  });
});

describe("namedAbove", () => {
  const field = namedAbove(u8("preDelay", 0), 100, TIME_NOTE_VALUES);

  it("decodes a code at or below the ceiling as the number it is", () => {
    expect(field.decode([100])).toBe(100);
  });

  it("decodes the codes above the ceiling as their names, from the first one up", () => {
    expect(field.decode([101])).toBe("1/32");
    expect(field.decode([110])).toBe("1/4");
    expect(field.decode([118])).toBe("2/1");
  });

  // A byte past the end of the list is one this codec cannot name. Decoding it as its number is
  // what lets the encoder write it back unchanged instead of failing the file's round trip.
  it("decodes a code past the end of the list as its number", () => {
    expect(field.decode([119])).toBe(119);
  });

  it("encodes a name back to the code it decoded from", () => {
    const bytes = [0];

    field.encode("1/4", bytes);

    expect(bytes).toEqual([110]);
  });

  it("encodes a number through the field it wraps", () => {
    const bytes = [0];

    field.encode(60, bytes);

    expect(bytes).toEqual([60]);
  });

  it("throws for a name the list doesn't hold", () => {
    const encodeUnknownName = () => { field.encode("1/5", [0]); };

    expect(encodeUnknownName).toThrow(/1\/5/);
  });
});

// The two orders are the same names counted opposite ways, and reading one off the other names a
// note nobody set: the first code above a rate's ceiling is the longest note, not the shortest.
describe("the device's two note orders", () => {
  it("counts a time up from the shortest note", () => {
    const time = syncedTime("time", 0);

    expect(time.decode([0, 7, 13, 1])).toBe("1/32");
  });

  it("counts a rate down from the longest", () => {
    const rate = syncedRate("rate", 0);

    expect(rate.decode([101])).toBe("2/1");
  });

  it("holds the same names in both", () => {
    expect([...RATE_NOTE_VALUES]).toEqual([...TIME_NOTE_VALUES].reverse());
  });
});
