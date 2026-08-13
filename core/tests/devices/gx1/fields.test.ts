import { describe, it, expect } from "vitest";
import { u8, signed, lookup, scaled, nibblePair, nibbleQuad, encodeFields } from "../../../src/devices/gx1/codec/fields";

describe("u8", () => {
  const field = u8("gain", 0);

  it("tags itself with kind \"u8\"", () => {
    expect(field.kind).toBe("u8");
  });

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

  it("tags itself with kind \"signed\" and the given center", () => {
    expect(field.kind).toBe("signed");
    expect(field.center).toBe(20);
  });

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

  it("tags itself with kind \"scaled\"", () => {
    expect(field.kind).toBe("scaled");
  });

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

  it("tags itself with kind \"nibblePair\"", () => {
    expect(field.kind).toBe("nibblePair");
  });

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

  it("tags itself with kind \"nibbleQuad\"", () => {
    expect(field.kind).toBe("nibbleQuad");
  });

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

  it("tags itself with kind \"lookup\" and the given table", () => {
    expect(field.kind).toBe("lookup");
    expect(field.table).toEqual(["ALPHA", "BETA"]);
  });

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

    expect(encodeUnknownName).toThrow('Unknown type value: "GAMMA"');
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
