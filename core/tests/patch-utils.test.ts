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
  capabilities: { chain: { description: "", defaultOrder: [] }, groups: [] },
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
    const patchNames = file.patches.map(patch => patch.name);

    expect(patchNames).toEqual(["Lead", "Rhythm"]);
  });

  it("replaces the patch with the same name in place, idempotent across reruns", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Rhythm")] }],
    ]);
    const driver = makeFakeDriver(files);

    upsertPatch(driver, "set.tsl", makePatch("Rhythm"));
    const file = upsertPatch(driver, "set.tsl", makePatch("Rhythm"));
    const patchNames = file.patches.map(patch => patch.name);

    expect(patchNames).toEqual(["Lead", "Rhythm"]);
  });

  it("propagates non-ENOENT errors from readFile", () => {
    const driver: PatchDriver = {
      ...makeFakeDriver(new Map()),
      readFile: () => { throw new Error("disk on fire"); },
    };

    const upsertWithBrokenReadFile = () => upsertPatch(driver, "set.tsl", makePatch("Lead"));

    expect(upsertWithBrokenReadFile).toThrow("disk on fire");
  });

  it("names a freshly created file after setName when provided, else after the patch", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);

    const named = upsertPatch(driver, "named.tsl", makePatch("Lead"), "My Library");
    expect(named.name).toBe("My Library");

    const unnamed = upsertPatch(driver, "unnamed.tsl", makePatch("Lead"));
    expect(unnamed.name).toBe("Lead");
  });

  it("renames an existing set when setName is given, and preserves it when omitted", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Old Name", device: "FAKE", patches: [makePatch("Lead")] }],
    ]);
    const driver = makeFakeDriver(files);

    const kept = upsertPatch(driver, "set.tsl", makePatch("Rhythm"));
    expect(kept.name).toBe("Old Name");

    const renamed = upsertPatch(driver, "set.tsl", makePatch("Solo"), "New Name");
    expect(renamed.name).toBe("New Name");
  });
});

describe("resolvePatchIndex", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Rock Lead")];

  it.each([
    { ref: "0", expected: 0 },
    { ref: "2", expected: 2 },
  ])("returns numeric index when ref is the integer string $ref", ({ ref, expected }) => {
    const index = resolvePatchIndex(patches, ref);

    expect(index).toBe(expected);
  });

  it.each(["clean jazz", "CLEAN JAZZ"])(
    "resolves name case-insensitively (trims stored patch name, not ref): %s",
    (ref) => {
      const index = resolvePatchIndex(patches, ref);

      expect(index).toBe(1);
    }
  );

  it("throws when no patch matches the name", () => {
    const resolveMissingName = () => resolvePatchIndex(patches, "Metal");

    expect(resolveMissingName).toThrow('No patch named "Metal"');
  });

  it("throws when multiple patches share the same name", () => {
    const resolveAmbiguousName = () => resolvePatchIndex(patches, "rock lead");

    expect(resolveAmbiguousName).toThrow(/Ambiguous name/);
    expect(resolveAmbiguousName).toThrow(/0.*2|2.*0/);
  });
});

describe("coerceValue", () => {
  it.each([
    { input: "0", expected: 0 },
    { input: "72", expected: 72 },
    { input: "-5", expected: -5 },
    { input: "3.14", expected: 3.14 },
    { input: "0.5", expected: 0.5 },
    { input: "", expected: 0 },
    { input: "hello", expected: "hello" },
    { input: "NaN", expected: "NaN" },
    { input: "FLAT", expected: "FLAT" },
    { input: "true", expected: true },
    { input: "false", expected: false },
  ])("coerces \"$input\" to $expected", ({ input, expected }) => {
    const result = coerceValue(input);

    expect(result).toBe(expected);
  });
});

describe("resolvePatchIndices", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Metal")];

  it("returns every index in file order when ref is omitted", () => {
    expect(resolvePatchIndices(patches)).toEqual([0, 1, 2]);
  });

  it.each([
    { ref: "1", expected: [1] },
    { ref: "metal", expected: [2] },
  ])("returns a single resolved index when ref is $ref", ({ ref, expected }) => {
    const indices = resolvePatchIndices(patches, ref);

    expect(indices).toEqual(expected);
  });

  it("propagates resolvePatchIndex's not-found error", () => {
    const resolveMissingName = () => resolvePatchIndices(patches, "Bogus");

    expect(resolveMissingName).toThrow('No patch named "Bogus"');
  });
});

describe("applyFieldEdits", () => {
  it("applies a single edit with coercion", () => {
    const patch: Record<string, unknown> = { amp: { gain: 0 } };

    applyFieldEdits(patch, [["amp.gain", "72"]]);

    const amp = patch.amp as Record<string, unknown>;
    expect(amp.gain).toBe(72);
  });

  it("applies multiple edits in order, including booleans", () => {
    const patch: Record<string, unknown> = { key: "C", amp: { solo: false, gain: 0 } };

    applyFieldEdits(patch, [["key", "G"], ["amp.solo", "true"], ["amp.gain", "50"]]);

    const amp = patch.amp as Record<string, unknown>;
    expect(patch.key).toBe("G");
    expect(amp.solo).toBe(true);
    expect(amp.gain).toBe(50);
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

    const a = obj.a as Record<string, unknown>;
    expect(a.b).toEqual({ c: 42 });
  });

  it("sets a two-level nested key", () => {
    const obj: Record<string, unknown> = { amp: { gain: 0, level: 0 } };

    setByPath(obj, "amp.gain", 80);

    const amp = obj.amp as Record<string, unknown>;
    expect(amp.gain).toBe(80);
    expect(amp.level).toBe(0);
  });

  it("overwrites an existing nested value", () => {
    const obj: Record<string, unknown> = { fx1: { params: { rate: 10 } } };

    setByPath(obj, "fx1.params.rate", 50);

    const fx1 = obj.fx1 as Record<string, unknown>;
    const params = fx1.params as Record<string, unknown>;
    expect(params.rate).toBe(50);
  });

  // A decoded patch already carries every field its device supports, so an absent field means the
  // device has no such control. Accepting the write would strand it — the encoder only emits known
  // byte indices, so it would vanish while the caller believed it landed.
  it("rejects an unknown leaf instead of creating it", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10, level: 100 } };

    expect(() => setByPath(obj, "amp.notAField", 1)).toThrow(/notAField/);
    expect(obj.amp).toEqual({ gain: 10, level: 100 });
  });

  it("rejects an unknown top-level field", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10 } };

    expect(() => setByPath(obj, "setName", "x")).toThrow(/setName/);
    expect(Object.keys(obj)).toEqual(["amp"]);
  });

  it("rejects a path that walks through a field the object doesn't have", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10 } };

    expect(() => setByPath(obj, "nope.nested.path", 1)).toThrow(/nope/);
  });

  it("rejects a path that walks through a non-object value", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10 } };

    expect(() => setByPath(obj, "amp.gain.deeper", 1)).toThrow(/amp\.gain/);
  });

  it("names the available fields when a path is rejected", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10, level: 100, treble: 50 } };

    expect(() => setByPath(obj, "amp.middle", 1)).toThrow(/gain, level, treble/);
  });
});
