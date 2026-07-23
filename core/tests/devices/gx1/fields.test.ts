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

    expect(encodeBelowRange).toThrow(/out of u8 range/);
  });

  it("throws when encoding a value above 255", () => {
    const encodeAboveRange = () => { field.encode(256, [0]); };

    expect(encodeAboveRange).toThrow(/out of u8 range/);
  });
});

describe("signed", () => {
  const field = signed("gain", 0, 20);

  it("tags itself with kind \"signed\" and the given center", () => {
    expect(field.kind).toBe("signed");
    expect(field.center).toBe(20);
  });
});

describe("scaled", () => {
  it("tags itself with kind \"scaled\"", () => {
    const field = scaled("time", 0, 0.1);

    expect(field.kind).toBe("scaled");
  });
});

describe("nibblePair", () => {
  it("tags itself with kind \"nibblePair\"", () => {
    const field = nibblePair("preDelay", 0);

    expect(field.kind).toBe("nibblePair");
  });
});

describe("nibbleQuad", () => {
  it("tags itself with kind \"nibbleQuad\"", () => {
    const field = nibbleQuad("time", 0);

    expect(field.kind).toBe("nibbleQuad");
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
