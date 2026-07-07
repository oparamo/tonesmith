import { describe, it, expect } from "vitest";
import { lookupName, lookupIndex } from "../../../src/devices/gx1/codec/primitives";

describe("lookupName", () => {
  const table = ["ONE", "TWO", "THREE"];

  it("returns the name at a valid index", () => {
    expect(lookupName(table, 1)).toBe("TWO");
  });

  it("falls back to an UNKNOWN_N sentinel for an index past the end of the table", () => {
    expect(lookupName(table, 5)).toBe("UNKNOWN_5");
  });

  it("falls back to an UNKNOWN_N sentinel for a negative index", () => {
    expect(lookupName(table, -1)).toBe("UNKNOWN_-1");
  });

  it("includes the label in the sentinel when given", () => {
    expect(lookupName(table, 9, "FX")).toBe("UNKNOWN_FX9");
  });
});

describe("lookupIndex", () => {
  const tableMap = { ONE: 0, TWO: 1, THREE: 2 };

  it("returns the index for a known name", () => {
    expect(lookupIndex(tableMap, "TWO")).toBe(1);
  });

  it("throws for a name not present in the table", () => {
    expect(() => lookupIndex(tableMap, "FOUR")).toThrow('Unknown : "FOUR"');
  });

  it("includes the label in the error message when given", () => {
    expect(() => lookupIndex(tableMap, "FOUR", "key")).toThrow('Unknown key: "FOUR"');
  });
});
