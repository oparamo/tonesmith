import { describe, it, expect } from "vitest";
import { bytesFromHex, hexFromBytes, lookupName, lookupIndex } from "../../../src/devices/gx1/codec/primitives";

describe("hexFromBytes", () => {
  it("renders each byte as two uppercase hex digits", () => {
    const hex = hexFromBytes([0, 15, 16, 255]);

    expect(hex).toEqual(["00", "0F", "10", "FF"]);
  });

  it("round-trips every byte value through bytesFromHex", () => {
    const everyByte = Array.from({ length: 256 }, (_, byte) => byte);

    expect(bytesFromHex(hexFromBytes(everyByte))).toEqual(everyByte);
  });

  /** Each case renders as a plausible-looking hex pair when it is not checked first. */
  it.each([
    { label: "a string", byteList: ["abc"], bad: "abc" },
    { label: "a negative", byteList: [0, -450], bad: "-450" },
    { label: "a value above 255", byteList: [256], bad: "256" },
    { label: "a fraction", byteList: [1.5], bad: "1.5" },
    { label: "NaN", byteList: [Number.NaN], bad: "NaN" },
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

    expect(lookupUnknownName).toThrow('Unknown key: "FOUR"');
  });

  it("gives back the index a lookupName sentinel stands for", () => {
    const index = lookupIndex(tableMap, lookupName(["ONE"], 5));

    expect(index).toBe(5);
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
