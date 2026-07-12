import { describe, it, expect } from "vitest";
import { lookupName, lookupIndex } from "../../../src/devices/gx1/codec/primitives";

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

    expect(lookupUnknownName).toThrow('Unknown : "FOUR"');
  });

  it("includes the label in the error message when given", () => {
    const lookupUnknownName = () => lookupIndex(tableMap, "FOUR", "key");

    expect(lookupUnknownName).toThrow('Unknown key: "FOUR"');
  });
});
