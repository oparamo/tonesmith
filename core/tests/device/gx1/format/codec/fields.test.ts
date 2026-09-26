import { describe, it, expect } from "vitest";
import {
  u8, signed, lookup, bool, scaled, nibblePair, nibbleQuad, namedAbove, syncedTime, syncedRate,
  decodeFields, encodeFields, liftSubType, withStoredSubType,
} from "../../../../../src/device/gx1/format/codec/fields";
import { TIME_NOTE_VALUES, SUB_TYPE_FIELD } from "../../../../../src/device/gx1/model";

describe("u8", () => {
  const field = u8("gain", 0);

  it("decodes the raw byte unchanged", () => {
    const decoded = field.decode([42]);

    expect(decoded).toBe(42);
  });

  it("encodes a value in range", () => {
    const bytes = [0];

    field.encode(50, bytes);

    expect(bytes).toStrictEqual([50]);
  });

  it("encodes the maximum value", () => {
    const bytes = [0];

    field.encode(255, bytes);

    expect(bytes).toStrictEqual([255]);
  });

  it("throws when encoding a value below 0", () => {
    const encodeBelowRange = () => { field.encode(-1, [0]); };

    expect(encodeBelowRange).toThrow(RangeError);
  });

  it("throws when encoding a value above 255", () => {
    const encodeAboveRange = () => { field.encode(256, [0]); };

    expect(encodeAboveRange).toThrow(RangeError);
  });

  it("throws when encoding a fraction", () => {
    const encodeFraction = () => { field.encode(1.5, [0]); };

    expect(encodeFraction).toThrow(RangeError);
  });

  it("throws when encoding a string", () => {
    const encodeString = () => { field.encode("50", [0]); };

    expect(encodeString).toThrow(RangeError);
  });

  it("throws when decoding past the end of the block, naming the field and the block's length", () => {
    const decodePastEnd = () => u8("gain", 3).decode([1, 2, 3]);

    expect(decodePastEnd).toThrow(/gain/);
    expect(decodePastEnd).toThrow(/\b3\b/);
  });
});

describe("signed", () => {
  const field = signed("gain", 0, 20);

  it.each([
    { raw: 30, decoded: 10 },
    { raw: 0, decoded: -20 },
  ])("decodes byte $raw as $decoded, offset by the center", ({ raw, decoded }) => {
    expect(field.decode([raw])).toBe(decoded);
  });

  it("defaults its center to 50", () => {
    const defaultCentered = signed("bias", 0);

    expect(defaultCentered.decode([50])).toBe(0);
  });

  it.each([
    { decoded: -20, byte: 0 },
    { decoded: 235, byte: 255 },
  ])("encodes $decoded to byte $byte at the ends of the center's range", ({ decoded, byte }) => {
    const bytes = [0];

    field.encode(decoded, bytes);

    expect(bytes).toStrictEqual([byte]);
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

  it("rounds a decode that lands on floating-point error to one decimal", () => {
    expect(field.decode([3])).toBe(0.3);
  });

  it("encodes a fractional value, which is the point of the factor", () => {
    const bytes = [0];

    field.encode(4.5, bytes);

    expect(bytes).toStrictEqual([45]);
  });

  it("encodes the top of the scaled range", () => {
    const bytes = [0];

    field.encode(25.5, bytes);

    expect(bytes).toStrictEqual([255]);
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

  it("encodes a value into its two nibbles, most significant first", () => {
    const bytes = [0, 0];

    field.encode(200, bytes);

    expect(bytes).toStrictEqual([12, 8]);
  });

  it("decodes two nibbles back into one value", () => {
    expect(field.decode([12, 8])).toBe(200);
  });

  it("encodes the maximum value its two nibbles hold", () => {
    const bytes = [0, 0];

    field.encode(255, bytes);

    expect(bytes).toStrictEqual([15, 15]);
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

  it("encodes a value into its four nibbles, most significant first", () => {
    const bytes = [0, 0, 0, 0];

    field.encode(2000, bytes);

    expect(bytes).toStrictEqual([0, 7, 13, 0]);
  });

  it("decodes four nibbles back into one value", () => {
    expect(field.decode([0, 7, 13, 0])).toBe(2000);
  });

  it("encodes the maximum value its four nibbles hold", () => {
    const bytes = [0, 0, 0, 0];

    field.encode(65535, bytes);

    expect(bytes).toStrictEqual([15, 15, 15, 15]);
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

describe("bool", () => {
  const field = bool("on", 0);

  it("decodes byte 0 as false", () => {
    expect(field.decode([0])).toBe(false);
  });

  it.each([1, 2])("decodes any non-zero byte, including %i, as true", raw => {
    expect(field.decode([raw])).toBe(true);
  });

  it.each([
    { value: true, byte: 1 },
    { value: false, byte: 0 },
  ])("encodes $value to byte $byte", ({ value, byte }) => {
    const bytes = [9];

    field.encode(value, bytes);

    expect(bytes).toStrictEqual([byte]);
  });

  it("throws encoding a non-boolean, naming the field", () => {
    const encodeNonBoolean = () => { field.encode(1, [0]); };

    expect(encodeNonBoolean).toThrow(/on/);
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

    expect(bytes).toStrictEqual([1]);
  });

  it("throws when encoding a name not in the table", () => {
    const encodeUnknownName = () => { field.encode("GAMMA", [0]); };

    expect(encodeUnknownName, "names the value it refused").toThrow(/GAMMA/);
    expect(encodeUnknownName, "and the field it refused it for").toThrow(/type/);
  });

  it("writes back a byte past the end of its table as it found it", () => {
    const bytes = [7];

    field.encode(field.decode(bytes), bytes);

    expect(bytes).toStrictEqual([7]);
  });
});

describe("decodeFields", () => {
  it("returns one entry per field, keyed by name", () => {
    const fields = [u8("gain", 0), u8("level", 1)];

    const params = decodeFields(fields, [10, 20]);

    expect(params).toStrictEqual({ gain: 10, level: 20 });
  });
});

describe("encodeFields", () => {
  it("only writes fields present in the params object, leaving the rest of the byte array untouched", () => {
    const fields = [u8("gain", 0), u8("level", 1)];
    const bytes = [10, 20];

    encodeFields(fields, { gain: 99 }, bytes);

    expect(bytes).toStrictEqual([99, 20]);
  });

  it("skips a field left out of params, but writes one that is false", () => {
    const fields = [bool("on", 0), u8("gain", 1)];
    const bytes = [1, 10];

    encodeFields(fields, { on: false }, bytes);

    expect(bytes).toStrictEqual([0, 10]);
  });
});

describe("liftSubType", () => {
  it("moves the selector string to subType and out of params", () => {
    const { subType, params } = liftSubType({ [SUB_TYPE_FIELD]: "BOSS COMP", sustain: 50 });

    expect(subType).toBe("BOSS COMP");
    expect(params).toStrictEqual({ sustain: 50 });
  });

  it("gives null when the selector holds a non-string value", () => {
    const { subType } = liftSubType({ [SUB_TYPE_FIELD]: 3 });

    expect(subType).toBeNull();
  });

  it("gives null when there is no selector at all", () => {
    const { subType } = liftSubType({ sustain: 50 });

    expect(subType).toBeNull();
  });
});

describe("withStoredSubType", () => {
  it("leaves params untouched, as the same object, when subType is null", () => {
    const params = { sustain: 50 };

    expect(withStoredSubType(params, null)).toBe(params);
  });

  it("adds the selector field when subType is a string", () => {
    const params = withStoredSubType({ sustain: 50 }, "BOSS COMP");

    expect(params).toStrictEqual({ sustain: 50, [SUB_TYPE_FIELD]: "BOSS COMP" });
  });
});

describe("namedAbove", () => {
  const field = namedAbove(u8("preDelay", 0), 100, TIME_NOTE_VALUES);

  it("decodes a code at or below the ceiling as the number it is", () => {
    expect(field.decode([100])).toBe(100);
  });

  it.each([
    { raw: 101, name: "1/32" },
    { raw: 110, name: "1/4" },
    { raw: 118, name: "2/1" },
  ])("decodes code $raw above the ceiling as $name", ({ raw, name }) => {
    expect(field.decode([raw])).toBe(name);
  });

  // A byte past the end of the list is one this codec cannot name. Decoding it as its number is
  // what lets the encoder write it back unchanged instead of failing the file's round trip.
  it("decodes a code past the end of the list as its number", () => {
    expect(field.decode([119])).toBe(119);
  });

  it("encodes a name back to the code it decoded from", () => {
    const bytes = [0];

    field.encode("1/4", bytes);

    expect(bytes).toStrictEqual([110]);
  });

  it("encodes a number through the field it wraps", () => {
    const bytes = [0];

    field.encode(60, bytes);

    expect(bytes).toStrictEqual([60]);
  });

  it("encodes a number above the ceiling through the base field unchanged", () => {
    const bytes = [0];

    field.encode(119, bytes);

    expect(bytes).toStrictEqual([119]);
  });

  it("throws for a name the list doesn't hold", () => {
    const encodeUnknownName = () => { field.encode("1/5", [0]); };

    expect(encodeUnknownName).toThrow(/1\/5/);
  });
});

describe("syncedTime and syncedRate", () => {
  // The two orders are the same names counted opposite ways, and reading one off the other names
  // a note nobody set: the first code above a rate's ceiling is the longest note, not the shortest.
  it("counts a time up from the shortest note", () => {
    const time = syncedTime("time", 0);

    expect(time.decode([0, 7, 13, 1])).toBe("1/32");
  });

  it("counts a rate down from the longest", () => {
    const rate = syncedRate("rate", 0);

    expect(rate.decode([101])).toBe("2/1");
  });

  it("decodes a syncedTime value at its 2000 ms ceiling as a number", () => {
    const time = syncedTime("time", 0);

    expect(time.decode([0, 7, 13, 0])).toBe(2000);
  });
});
