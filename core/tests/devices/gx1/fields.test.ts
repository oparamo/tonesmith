import { describe, it, expect } from "vitest";
import { u8, signed, lookup, scaled, nibblePair, nibbleQuad, encodeFields } from "../../../src/devices/gx1/codec/fields";

describe("u8", () => {
  const field = u8("gain", 0);

  it("tags itself with kind \"u8\"", () => {
    expect(field.kind).toBe("u8");
  });

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

describe("signed", () => {
  const field = signed("gain", 0, 20);

  it("tags itself with kind \"signed\" and the given centre", () => {
    expect(field.kind).toBe("signed");
    expect(field.centre).toBe(20);
  });
});

describe("scaled", () => {
  it("tags itself with kind \"scaled\"", () => {
    expect(scaled("time", 0, 0.1).kind).toBe("scaled");
  });
});

describe("nibblePair", () => {
  it("tags itself with kind \"nibblePair\"", () => {
    expect(nibblePair("preDelay", 0).kind).toBe("nibblePair");
  });
});

describe("nibbleQuad", () => {
  it("tags itself with kind \"nibbleQuad\"", () => {
    expect(nibbleQuad("time", 0).kind).toBe("nibbleQuad");
  });
});

describe("lookup", () => {
  const field = lookup("type", 0, ["ALPHA", "BETA"]);

  it("tags itself with kind \"lookup\" and the given table", () => {
    expect(field.kind).toBe("lookup");
    expect(field.table).toEqual(["ALPHA", "BETA"]);
  });

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
