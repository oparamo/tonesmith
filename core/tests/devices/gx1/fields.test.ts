import { describe, it, expect } from "vitest";
import { u8, lookup, encodeFields } from "../../../src/devices/gx1/codec/fields";

describe("u8", () => {
  const field = u8("gain", 0);

  it("decodes the raw byte unchanged", () => {
    expect(field.decode([42])).toBe(42);
  });

  it("encodes a value in range", () => {
    const bytes = [0];
    field.encode(50, bytes);
    expect(bytes).toEqual([50]);
  });

  it("throws when encoding a value below 0", () => {
    expect(() => { field.encode(-1, [0]); }).toThrow(/out of u8 range/);
  });

  it("throws when encoding a value above 255", () => {
    expect(() => { field.encode(256, [0]); }).toThrow(/out of u8 range/);
  });
});

describe("lookup", () => {
  const field = lookup("type", 0, ["ALPHA", "BETA"]);

  it("decodes a known index to its name", () => {
    expect(field.decode([1])).toBe("BETA");
  });

  it("encodes a known name to its index", () => {
    const bytes = [0];
    field.encode("BETA", bytes);
    expect(bytes).toEqual([1]);
  });

  it("throws when encoding a name not in the table", () => {
    expect(() => { field.encode("GAMMA", [0]); }).toThrow('Unknown type value: "GAMMA"');
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
