import { describe, it, expect } from "vitest";
import {
  bytesFromHex, hexFromBytes, byteAt, byteReader, lookupName, lookupIndex, tableIndex,
  shownValue, toSigned, toUnsigned,
} from "../../../../../src/device/gx1/format/codec/primitives";

describe("hexFromBytes", () => {
  it("renders each byte as two uppercase hex digits", () => {
    const hex = hexFromBytes([0, 15, 16, 255]);

    expect(hex).toStrictEqual(["00", "0F", "10", "FF"]);
  });

  it("round-trips every byte value through bytesFromHex", () => {
    const everyByte = Array.from({ length: 256 }, (_, byte) => byte);

    expect(bytesFromHex(hexFromBytes(everyByte))).toStrictEqual(everyByte);
  });

  it("returns an empty list for an empty list", () => {
    expect(hexFromBytes([])).toStrictEqual([]);
  });

  it.each([
    { label: "a string", byteList: ["abc"], bad: "abc" },
    { label: "a negative", byteList: [0, -450], bad: "-450" },
    { label: "a value above 255", byteList: [256], bad: "256" },
    { label: "a fraction", byteList: [1.5], bad: "1.5" },
    { label: "NaN", byteList: [Number.NaN], bad: "NaN" },
    { label: "Infinity", byteList: [Number.POSITIVE_INFINITY], bad: "Infinity" },
  ])("throws for $label rather than writing it to the file", ({ byteList, bad }) => {
    const encodeBadByte = () => hexFromBytes(byteList as number[]);

    expect(encodeBadByte).toThrow(RangeError);
    expect(encodeBadByte).toThrow(new RegExp(bad.replace(".", "\\.")));
  });

  it("names the index of the offending byte", () => {
    const encodeBadByte = () => hexFromBytes([1, 2, 300]);

    expect(encodeBadByte).toThrow(/\b2\b/);
  });
});

describe("byteAt", () => {
  it("reads the byte at the boundary index, the block's last one", () => {
    expect(byteAt([10, 20, 30], 2, "gain")).toBe(30);
  });

  it("throws naming the label and the block's length for an index past the end", () => {
    const readPastEnd = () => byteAt([10, 20, 30], 3, "gain");

    expect(readPastEnd).toThrow(RangeError);
    expect(readPastEnd).toThrow(/gain/);
    expect(readPastEnd).toThrow(/\b3\b/);
  });
});

describe("byteReader", () => {
  it("binds byteAt to one block, reading by index alone", () => {
    const readByte = byteReader([10, 20, 30], "gain");

    expect(readByte(1)).toBe(20);
  });

  it("throws naming the label for an index past the bound block", () => {
    const readByte = byteReader([10, 20, 30], "gain");
    const readPastEnd = () => readByte(5);

    expect(readPastEnd).toThrow(/gain/);
  });
});

describe("lookupName", () => {
  const table = ["ONE", "TWO", "THREE"];

  it("returns the name at a valid index", () => {
    const name = lookupName(table, 1);

    expect(name).toBe("TWO");
  });

  it("falls back to an UNKNOWN_N sentinel for an index past the end of the table", () => {
    const name = lookupName(table, 5);

    expect(name).toBe("UNKNOWN_5");
  });

  it("falls back to an UNKNOWN_N sentinel for a negative index", () => {
    const name = lookupName(table, -1);

    expect(name).toBe("UNKNOWN_-1");
  });

  it("includes the label in the sentinel when given", () => {
    const name = lookupName(table, 9, "FX");

    expect(name).toBe("UNKNOWN_FX9");
  });
});

describe("lookupIndex", () => {
  const tableMap = { ONE: 0, TWO: 1, THREE: 2 };

  it("returns the index for a known name", () => {
    const index = lookupIndex(tableMap, "TWO");

    expect(index).toBe(1);
  });

  it("throws for a name not present in the table", () => {
    const lookupUnknownName = () => lookupIndex(tableMap, "FOUR");

    expect(lookupUnknownName).toThrow(/FOUR/);
  });

  it("includes the label in the error message when given", () => {
    const lookupUnknownName = () => lookupIndex(tableMap, "FOUR", "key");

    expect(lookupUnknownName).toThrow(/key/);
  });

  it("gives back the index a lookupName sentinel stands for", () => {
    const index = lookupIndex(tableMap, lookupName(["ONE"], 5));

    expect(index).toBe(5);
  });

  it("reads a negative sentinel back as its negative index", () => {
    const index = lookupIndex(tableMap, lookupName(["ONE"], -1));

    expect(index).toBe(-1);
  });

  it("reads the index out of a labelled sentinel", () => {
    const index = lookupIndex(tableMap, lookupName(["ONE"], 38, "FX"), "FX type");

    expect(index).toBe(38);
  });

  it("throws for a sentinel with no index to read", () => {
    const lookupBareSentinel = () => lookupIndex(tableMap, "UNKNOWN_");

    expect(lookupBareSentinel).toThrow(/UNKNOWN_/);
  });
});

describe("tableIndex", () => {
  const table = ["ALPHA", "BETA", "GAMMA"];

  it("returns a value's position in the table", () => {
    expect(tableIndex(table, "BETA", "type")).toBe(1);
  });

  it("returns the index a sentinel value was built from", () => {
    expect(tableIndex(table, lookupName(table, 7), "type")).toBe(7);
  });

  it("throws naming the label for a value the table doesn't hold and no sentinel names", () => {
    const lookupUnknown = () => tableIndex(table, "DELTA", "type");

    expect(lookupUnknown).toThrow(/type/);
    expect(lookupUnknown).toThrow(/DELTA/);
  });
});

describe("shownValue", () => {
  it("quotes a string", () => {
    expect(shownValue("abc")).toBe('"abc"');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])("shows %s as itself", value => {
    expect(shownValue(value)).toBe(String(value));
  });
});

describe("toSigned and toUnsigned", () => {
  it("defaults the center to 50", () => {
    expect(toSigned(60)).toBe(10);
    expect(toUnsigned(10)).toBe(60);
  });

  it("offsets by a custom center", () => {
    expect(toSigned(30, 20)).toBe(10);
    expect(toUnsigned(10, 20)).toBe(30);
  });

  it("are inverses of each other", () => {
    expect(toUnsigned(toSigned(77, 24), 24)).toBe(77);
  });
});
