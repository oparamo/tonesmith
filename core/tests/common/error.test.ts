import { describe, it, expect } from "vitest";
import { messageOf } from "../../src/common/error";

describe("messageOf", () => {
  it("gives an Error's message, without the \"Error: \" prefix String() would add", () => {
    expect(messageOf(new Error("disk on fire"))).toBe("disk on fire");
  });

  it("gives an Error subclass's message the same way", () => {
    expect(messageOf(new TypeError("wrong shape"))).toBe("wrong shape");
  });

  it("gives an empty string for an Error with an empty message", () => {
    expect(messageOf(new Error(""))).toBe("");
  });

  it("gives a thrown string as itself", () => {
    expect(messageOf("plain string")).toBe("plain string");
  });

  it.each([
    { value: 42, expected: "42" },
    { value: undefined, expected: "undefined" },
  ])("gives a thrown $value its String() form", ({ value, expected }) => {
    expect(messageOf(value)).toBe(expected);
  });
});
