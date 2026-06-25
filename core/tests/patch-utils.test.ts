import { describe, it, expect } from "vitest";
import type { Patch } from "../src/types";
import { resolvePatchIndex, coerceValue, setByPath } from "../src/patch-utils";

const makePatch = (name: string): Patch =>
  ({ name }) as unknown as Patch;

describe("resolvePatchIndex", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Rock Lead")];

  it("returns numeric index when ref is an integer string", () => {
    expect(resolvePatchIndex(patches, "0")).toBe(0);
    expect(resolvePatchIndex(patches, "2")).toBe(2);
  });

  it("resolves name case-insensitively (trims stored patch name, not ref)", () => {
    expect(resolvePatchIndex(patches, "clean jazz")).toBe(1);
    expect(resolvePatchIndex(patches, "CLEAN JAZZ")).toBe(1);
  });

  it("throws when no patch matches the name", () => {
    expect(() => resolvePatchIndex(patches, "Metal")).toThrow('No patch named "Metal"');
  });

  it("throws when multiple patches share the same name", () => {
    expect(() => resolvePatchIndex(patches, "rock lead")).toThrow(/Ambiguous name/);
    expect(() => resolvePatchIndex(patches, "rock lead")).toThrow(/0.*2|2.*0/);
  });
});

describe("coerceValue", () => {
  it("converts integer strings to numbers", () => {
    expect(coerceValue("0")).toBe(0);
    expect(coerceValue("72")).toBe(72);
    expect(coerceValue("-5")).toBe(-5);
  });

  it("converts float strings to numbers", () => {
    expect(coerceValue("3.14")).toBe(3.14);
    expect(coerceValue("0.5")).toBe(0.5);
  });

  it("converts empty string to 0", () => {
    expect(coerceValue("")).toBe(0);
  });

  it("returns non-numeric strings unchanged", () => {
    expect(coerceValue("hello")).toBe("hello");
    expect(coerceValue("NaN")).toBe("NaN");
    expect(coerceValue("true")).toBe("true");
    expect(coerceValue("FLAT")).toBe("FLAT");
  });
});

describe("setByPath", () => {
  it("sets a top-level key", () => {
    const obj: Record<string, unknown> = { x: 1 };
    setByPath(obj, "x", 99);
    expect(obj.x).toBe(99);
  });

  it("sets a nested key", () => {
    const obj: Record<string, unknown> = { a: { b: { c: 0 } } };
    setByPath(obj, "a.b.c", 42);
    expect((obj.a as Record<string, unknown>).b).toEqual({ c: 42 });
  });

  it("sets a two-level nested key", () => {
    const obj: Record<string, unknown> = { amp: { gain: 0, level: 0 } };
    setByPath(obj, "amp.gain", 80);
    expect((obj.amp as Record<string, unknown>).gain).toBe(80);
    expect((obj.amp as Record<string, unknown>).level).toBe(0);
  });

  it("overwrites an existing nested value", () => {
    const obj: Record<string, unknown> = { fx1: { params: { rate: 10 } } };
    setByPath(obj, "fx1.params.rate", 50);
    expect(
      ((obj.fx1 as Record<string, unknown>).params as Record<string, unknown>).rate,
    ).toBe(50);
  });
});
