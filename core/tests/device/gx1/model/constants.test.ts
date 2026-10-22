import { describe, it, expect } from "vitest";
import { charsAbove, TIME_NOTE_VALUES, RATE_NOTE_VALUES } from "../../../../src/device/gx1/model/constants";

describe("charsAbove", () => {
  it("returns an empty list for an empty name", () => {
    expect(charsAbove(0xFF, "")).toStrictEqual([]);
  });

  it("keeps out a character exactly at the ceiling", () => {
    expect(charsAbove(0x41, "A")).toStrictEqual([]);
  });

  it("returns a character one code point past the ceiling", () => {
    expect(charsAbove(0x41, "B")).toStrictEqual(["B"]);
  });

  it("returns a character outside the BMP whole, not as two surrogates", () => {
    const emoji = "\u{1F600}";

    expect(charsAbove(0xFF, emoji)).toStrictEqual([emoji]);
  });
});

// The two orders are the same names counted opposite ways, and reading one off the other names a
// note nobody set: the first code above a rate's ceiling is the longest note, not the shortest.
describe("the device's two note orders", () => {
  it("holds the same names in both", () => {
    expect([...RATE_NOTE_VALUES]).toStrictEqual([...TIME_NOTE_VALUES].reverse());
  });
});
