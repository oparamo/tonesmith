import { describe, it, expect } from "vitest";
import type { Patch, PatchFile, PatchDriver } from "../src/types";
import {
  resolvePatchIndex, coerceValue, setByPath, resolvePatchIndices, applyFieldEdits, upsertPatch,
} from "../src/patch-utils";

const makePatch = (name: string): Patch =>
  ({ name });

/** In-memory PatchDriver stand-in — upsertPatch is device-agnostic, so this proves it works against the PatchDriver interface alone, not gx1 specifics. */
const makeFakeDriver = (files: Map<string, PatchFile>): PatchDriver => ({
  id: "fake",
  name: "Fake",
  capabilities: { groups: [] },
  readFile: (path) => {
    const file = files.get(path);
    if (!file) {
      const error = new Error(`ENOENT: no such file, open '${path}'`) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return file;
  },
  writeFile: (file, path) => { files.set(path, file); },
  newFile: (setName, nPatches = 1) => ({
    name: setName, device: "FAKE",
    patches: Array.from({ length: nPatches }, () => makePatch("blank")),
  }),
  blankPatch: (name = "blank") => makePatch(name),
  decodePatch: (raw) => raw as unknown as Patch,
  encodePatch: (patch) => patch as unknown as Record<string, unknown>,
});

describe("upsertPatch", () => {
  it("creates a new file when the path doesn't exist yet", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    const patch = makePatch("Lead");

    const file = upsertPatch(driver, "new.tsl", patch);

    expect(file.patches).toEqual([patch]);
    expect(files.get("new.tsl")).toBe(file);
  });

  it("appends when no patch in the existing file shares the name", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Set", device: "FAKE", patches: [makePatch("Lead")] }],
    ]);
    const driver = makeFakeDriver(files);

    const file = upsertPatch(driver, "set.tsl", makePatch("Rhythm"));

    expect(file.patches.map(p => p.name)).toEqual(["Lead", "Rhythm"]);
  });

  it("replaces the patch with the same name in place, idempotent across reruns", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Rhythm")] }],
    ]);
    const driver = makeFakeDriver(files);

    upsertPatch(driver, "set.tsl", makePatch("Rhythm"));
    const file = upsertPatch(driver, "set.tsl", makePatch("Rhythm"));

    expect(file.patches.map(p => p.name)).toEqual(["Lead", "Rhythm"]);
  });

  it("propagates non-ENOENT errors from readFile", () => {
    const driver: PatchDriver = {
      ...makeFakeDriver(new Map()),
      readFile: () => { throw new Error("disk on fire"); },
    };
    expect(() => upsertPatch(driver, "set.tsl", makePatch("Lead"))).toThrow("disk on fire");
  });
});

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

  it("returns non-numeric, non-boolean strings unchanged", () => {
    expect(coerceValue("hello")).toBe("hello");
    expect(coerceValue("NaN")).toBe("NaN");
    expect(coerceValue("FLAT")).toBe("FLAT");
  });

  it("converts \"true\"/\"false\" strings to booleans", () => {
    expect(coerceValue("true")).toBe(true);
    expect(coerceValue("false")).toBe(false);
  });
});

describe("resolvePatchIndices", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Metal")];

  it("returns every index in file order when ref is omitted", () => {
    expect(resolvePatchIndices(patches)).toEqual([0, 1, 2]);
  });

  it("returns a single resolved index when ref is given", () => {
    expect(resolvePatchIndices(patches, "1")).toEqual([1]);
    expect(resolvePatchIndices(patches, "metal")).toEqual([2]);
  });

  it("propagates resolvePatchIndex's not-found error", () => {
    expect(() => resolvePatchIndices(patches, "Bogus")).toThrow('No patch named "Bogus"');
  });
});

describe("applyFieldEdits", () => {
  it("applies a single edit with coercion", () => {
    const patch: Record<string, unknown> = { amp: { gain: 0 } };
    applyFieldEdits(patch, [["amp.gain", "72"]]);
    expect((patch.amp as Record<string, unknown>).gain).toBe(72);
  });

  it("applies multiple edits in order, including booleans", () => {
    const patch: Record<string, unknown> = { key: "C", amp: { solo: false, gain: 0 } };
    applyFieldEdits(patch, [["key", "G"], ["amp.solo", "true"], ["amp.gain", "50"]]);
    expect(patch.key).toBe("G");
    expect((patch.amp as Record<string, unknown>).solo).toBe(true);
    expect((patch.amp as Record<string, unknown>).gain).toBe(50);
  });

  it("does nothing given an empty edit list", () => {
    const patch: Record<string, unknown> = { key: "C" };
    applyFieldEdits(patch, []);
    expect(patch.key).toBe("C");
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
