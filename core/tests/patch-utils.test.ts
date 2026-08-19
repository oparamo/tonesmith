import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Patch, PatchFile, PatchDriver } from "../src/types";
import {
  resolvePatchIndex, coerceValue, setByPath, resolvePatches, applyFieldEdits,
  upsertPatches, copyPatch, createPatchFile, MAX_NEW_PATCHES,
} from "../src/patch-utils";
import { scratchDir } from "./helpers";

const makePatch = (name: string): Patch =>
  ({ name });

/** In-memory PatchDriver stand-in, so these suites exercise the interface alone, not gx1 specifics. */
const makeFakeDriver = (files: Map<string, PatchFile>): PatchDriver => ({
  id: "fake",
  name: "Fake",
  capabilities: { chain: { description: "", defaultOrder: [], blocks: {} }, patchName: { maxLength: 16 }, groups: [] },
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
  buildPatch: (spec) => makePatch((spec as { name: string }).name),
  validateFields: () => [],
  decodePatch: (raw) => raw as unknown as Patch,
  encodePatch: (patch) => patch as unknown as Record<string, unknown>,
});

/** Wraps a fake driver to count how many times the file is actually read and written. */
const makeCountingDriver = (files: Map<string, PatchFile>): { driver: PatchDriver; counts: { reads: number; writes: number } } => {
  const base = makeFakeDriver(files);
  const counts = { reads: 0, writes: 0 };
  const driver: PatchDriver = {
    ...base,
    readFile: (path) => {
      counts.reads += 1;
      return base.readFile(path);
    },
    writeFile: (file, path) => {
      counts.writes += 1;
      base.writeFile(file, path);
    },
  };
  return { driver, counts };
};

describe("upsertPatches", () => {
  it("creates the file and saves every patch in array order", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    const patches = [makePatch("First"), makePatch("Second"), makePatch("Third")];

    const { file } = upsertPatches(driver, { path: "set.tsl", patches });

    expect(file.patches).toEqual(patches);
    expect(files.get("set.tsl")).toBe(file);
  });

  it("replaces same-named patches and appends the rest, in one pass", () => {
    const existing = { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Rhythm")] };
    const files = new Map<string, PatchFile>([["set.tsl", existing]]);
    const driver = makeFakeDriver(files);
    const patches = [makePatch("Rhythm"), makePatch("Solo")];

    const { file } = upsertPatches(driver, { path: "set.tsl", patches });
    const patchNames = file.patches.map(patch => patch.name);

    expect(patchNames, "Rhythm replaced in place, Solo appended").toEqual(["Lead", "Rhythm", "Solo"]);
  });

  it("stays idempotent across reruns of the same batch", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Rhythm")] }],
    ]);
    const driver = makeFakeDriver(files);
    const patches = [makePatch("Rhythm")];

    upsertPatches(driver, { path: "set.tsl", patches });
    const { file } = upsertPatches(driver, { path: "set.tsl", patches });
    const patchNames = file.patches.map(patch => patch.name);

    expect(patchNames).toEqual(["Lead", "Rhythm"]);
  });

  // The whole point of the batch form: a set lands as one atomic write, not one cycle per patch.
  it("reads and writes the file exactly once however many patches are saved", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Set", device: "FAKE", patches: [] }],
    ]);
    const { driver, counts } = makeCountingDriver(files);
    const patches = [makePatch("One"), makePatch("Two"), makePatch("Three"), makePatch("Four")];

    upsertPatches(driver, { path: "set.tsl", patches });

    expect(counts.reads).toBe(1);
    expect(counts.writes).toBe(1);
  });

  it("propagates non-ENOENT errors from readFile", () => {
    const driver: PatchDriver = {
      ...makeFakeDriver(new Map()),
      readFile: () => { throw new Error("disk on fire"); },
    };

    const upsertWithBrokenReadFile = () =>
      upsertPatches(driver, { path: "set.tsl", patches: [makePatch("Lead")] });

    expect(upsertWithBrokenReadFile).toThrow("disk on fire");
  });

  it("names a freshly created file after setName when given, else after the first patch", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    const patches = [makePatch("First"), makePatch("Second")];

    const named = upsertPatches(driver, { path: "named.tsl", patches, setName: "My Library" });
    expect(named.file.name).toBe("My Library");

    const unnamed = upsertPatches(driver, { path: "unnamed.tsl", patches });
    expect(unnamed.file.name).toBe("First");
  });

  it("renames an existing set when setName is given, and preserves it when omitted", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Old Name", device: "FAKE", patches: [makePatch("Lead")] }],
    ]);
    const driver = makeFakeDriver(files);

    const kept = upsertPatches(driver, { path: "set.tsl", patches: [makePatch("Rhythm")] });
    expect(kept.file.name).toBe("Old Name");

    const renamed = upsertPatches(driver, {
      path: "set.tsl",
      patches: [makePatch("Solo")],
      setName: "New Name",
    });
    expect(renamed.file.name).toBe("New Name");
  });

  // The saving surfaces tell a caller what became of each patch. Reading the file back to work it
  // out costs a second decode of everything, and undoes this call's read-once/write-once property.
  it("reports the file as created and says what happened to each patch", () => {
    const files = new Map<string, PatchFile>([
      ["set.tsl", { name: "Set", device: "FAKE", patches: [makePatch("Lead")] }],
    ]);
    const driver = makeFakeDriver(files);

    const fresh = upsertPatches(driver, { path: "new.tsl", patches: [makePatch("Solo")] });
    const existing = upsertPatches(driver, {
      path: "set.tsl",
      patches: [makePatch("Lead"), makePatch("Clean")],
    });

    expect(fresh.created).toBe(true);
    expect(fresh.saved).toEqual([{ name: "Solo", action: "appended" }]);
    expect(existing.created).toBe(false);
    expect(existing.saved).toEqual([
      { name: "Lead", action: "replaced" },
      { name: "Clean", action: "appended" },
    ]);
  });

  it("rejects an empty batch rather than writing an unnamed file", () => {
    const driver = makeFakeDriver(new Map());

    const upsertNothing = () => upsertPatches(driver, { path: "set.tsl", patches: [] });

    expect(upsertNothing).toThrow();
  });

  // A save keys on the name, so a repeat within one batch cannot be honored: the second patch
  // replaces the first, and the report would say both were saved when only one survives.
  it("rejects a name repeated within one batch, naming it and both positions", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    const patches = [makePatch("Lead"), makePatch("Clean"), makePatch("Lead")];

    const upsertRepeatedName = () => upsertPatches(driver, { path: "set.tsl", patches });

    expect(upsertRepeatedName).toThrow(/Lead/);
    expect(upsertRepeatedName).toThrow(/0/);
    expect(upsertRepeatedName).toThrow(/2/);
    expect(files.has("set.tsl"), "nothing is written when the batch is rejected").toBe(false);
  });
});

describe("resolvePatchIndex", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Rock Lead")];

  it("returns numeric index when ref is the integer string", () => {
    const index = resolvePatchIndex(patches, "1");

    expect(index).toBe(1);
  });

  it("resolves name case-insensitively", () => {
    const index = resolvePatchIndex(patches, "clean jazz");

    expect(index).toBe(1);
  });

  it("throws when no patch matches the name", () => {
    const resolveMissingName = () => resolvePatchIndex(patches, "Metal");

    expect(resolveMissingName).toThrow(/Metal/);
  });

  // Callers index straight into the array with what this returns, so an unchecked index reads as
  // undefined, or on a write leaves a hole that encodes as a corrupt file.
  it("throws for an index past the last patch", () => {
    const resolvePastEnd = () => resolvePatchIndex(patches, "3");

    expect(resolvePastEnd).toThrow(/3/);
  });

  it("throws for a negative index", () => {
    const resolveNegative = () => resolvePatchIndex(patches, "-1");

    expect(resolveNegative).toThrow(/-1/);
  });

  it("throws when multiple patches share the same name", () => {
    const resolveAmbiguousName = () => resolvePatchIndex(patches, "rock lead");

    expect(resolveAmbiguousName).toThrow(/rock lead/);
    expect(resolveAmbiguousName, "names both colliding indices").toThrow(/0.*2|2.*0/);
  });

  // Every surface takes the ref as a bare string, so an omitted one arrives here as "". Read as a
  // number it is 0, which would select the first patch and, on a write, overwrite it.
  it.each(["", "   "])("rejects %o rather than selecting the first patch", (ref) => {
    const resolveEmpty = () => resolvePatchIndex(patches, ref);

    expect(resolveEmpty).toThrow();
  });

  it("reads a padded integer as that index", () => {
    const index = resolvePatchIndex(patches, " 1 ");

    expect(index).toBe(1);
  });

  // Number() accepts both of these and rounds them into an index, which would select a patch
  // the caller never spelled out.
  it.each(["0x1", "2.0"])("does not read %o as an index", (ref) => {
    const resolveNonIndex = () => resolvePatchIndex(patches, ref);

    expect(resolveNonIndex).toThrow(new RegExp(ref.replace(".", "\\.")));
  });

  it("finds a patch whose name is all digits once no such index exists", () => {
    const withNumericName = [...patches, makePatch("808")];

    expect(resolvePatchIndex(withNumericName, "808")).toBe(3);
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
  ])("coerces \"$input\" to $expected where the field holds a number", ({ input, expected }) => {
    const result = coerceValue(input, 0);

    expect(result).toBe(expected);
  });

  it.each(["1984", "true", "0"])("leaves %o alone where the field already holds a string", (input) => {
    const result = coerceValue(input, "Rock Lead");

    expect(result).toBe(input);
  });

  it.each([88, true, "FLAT"])("passes %o through when it is not a string to interpret", (input) => {
    const result = coerceValue(input, 0);

    expect(result).toBe(input);
  });
});

describe("resolvePatches", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Metal")];

  it("returns every patch in file order when ref is omitted", () => {
    const selected = resolvePatches(patches);

    expect(selected.map(entry => entry.index)).toEqual([0, 1, 2]);
    expect(selected.map(entry => entry.patch)).toEqual(patches);
  });

  it("returns the one patch a ref names, with the index it sits at", () => {
    const selected = resolvePatches(patches, "1");

    expect(selected).toEqual([{ index: 1, patch: patches[1] }]);
  });

  it("propagates resolvePatchIndex's not-found error", () => {
    const resolveMissingName = () => resolvePatches(patches, "Bogus");

    expect(resolveMissingName).toThrow(/Bogus/);
  });
});

describe("applyFieldEdits", () => {
  const editable = (fields: Record<string, unknown>): Patch =>
    ({ name: "Edit me", ...fields });

  /** Accepts everything, so these cases exercise the shared half rather than a device's catalog. */
  const permissive = makeFakeDriver(new Map());

  /** Stands in for a device rejecting a value its catalog does not allow. */
  const rejecting = (issues: string[]): PatchDriver =>
    ({ ...permissive, validateFields: () => issues });

  it("applies a single edit with coercion", () => {
    const patch = editable({ amp: { gain: 0 } });

    applyFieldEdits(permissive, patch, [["amp.gain", "72"]]);

    const amp = (patch as unknown as Record<string, unknown>).amp as Record<string, unknown>;
    expect(amp.gain).toBe(72);
  });

  it("applies multiple edits in order, including booleans", () => {
    const patch = editable({ key: "C", amp: { solo: false, gain: 0 } });

    applyFieldEdits(permissive, patch, [["key", "G"], ["amp.solo", "true"], ["amp.gain", "50"]]);

    const fields = patch as unknown as Record<string, unknown>;
    const amp = fields.amp as Record<string, unknown>;
    expect(fields.key).toBe("G");
    expect(amp.solo).toBe(true);
    expect(amp.gain).toBe(50);
  });

  it("does nothing given an empty edit list", () => {
    const patch = editable({ key: "C" });

    applyFieldEdits(permissive, patch, []);

    expect((patch as unknown as Record<string, unknown>).key).toBe("C");
  });

  it("keeps a numeric-looking name a string, since the field it lands in holds one", () => {
    const patch = editable({});

    applyFieldEdits(permissive, patch, [["name", "1984"]]);

    expect(patch.name).toBe("1984");
  });

  it("takes a value that arrives already typed, not only its string form", () => {
    const patch = editable({ amp: { solo: false, gain: 0 } });

    applyFieldEdits(permissive, patch, [["amp.gain", 72], ["amp.solo", true]]);

    const amp = (patch as unknown as Record<string, unknown>).amp as Record<string, unknown>;
    expect(amp.gain).toBe(72);
    expect(amp.solo).toBe(true);
  });

  it("returns each landed value keyed by path, so a caller can report what it wrote", () => {
    const patch = editable({ amp: { gain: 0 } });

    const applied = applyFieldEdits(permissive, patch, [["name", "1984"], ["amp.gain", "72"]]);

    expect(applied).toEqual({ name: "1984", "amp.gain": 72 });
  });

  it("hands the driver every edit it applied, keyed by path", () => {
    const seen: Record<string, unknown>[] = [];
    const recording: PatchDriver = { ...permissive, validateFields: (_, edits) => { seen.push(edits); return []; } };

    applyFieldEdits(recording, editable({ amp: { gain: 0 } }), [["amp.gain", "72"]]);

    expect(seen).toEqual([{ "amp.gain": 72 }]);
  });

  it("throws with every issue the driver reports rather than the first", () => {
    const applyRejectedEdits = () =>
      { applyFieldEdits(rejecting(["gain is too high", "level is too low"]), editable({ amp: { gain: 0 } }), [["amp.gain", "900"]]); };

    expect(applyRejectedEdits).toThrow(/gain is too high/);
    expect(applyRejectedEdits).toThrow(/level is too low/);
  });
});

describe("setByPath", () => {
  it("sets a top-level key", () => {
    const obj: Record<string, unknown> = { x: 1 };

    setByPath(obj, "x", 99);

    expect(obj.x).toBe(99);
  });

  it("walks to a nested key, overwriting it and leaving its siblings alone", () => {
    const obj: Record<string, unknown> = { fx1: { on: true, params: { rate: 10, depth: 20 } } };

    setByPath(obj, "fx1.params.rate", 50);

    expect(obj.fx1).toEqual({ on: true, params: { rate: 50, depth: 20 } });
  });

  // A decoded patch already carries every field its device supports, so an absent field means the
  // device has no such control. Accepting the write would strand it, since the encoder only emits known
  // byte indices, so it would vanish while the caller believed it landed.
  it("rejects an unknown leaf instead of creating it", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10, level: 100 } };

    expect(() => { setByPath(obj, "amp.notAField", 1); }).toThrow(/notAField/);
    expect(obj.amp).toEqual({ gain: 10, level: 100 });
  });

  it("rejects an unknown top-level field", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10 } };

    expect(() => { setByPath(obj, "setName", "x"); }).toThrow(/setName/);
    expect(Object.keys(obj)).toEqual(["amp"]);
  });

  it("rejects a path that walks through a field the object doesn't have", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10 } };

    expect(() => { setByPath(obj, "nope.nested.path", 1); }).toThrow(/nope/);
  });

  it("rejects a path that walks through a non-object value", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10 } };

    expect(() => { setByPath(obj, "amp.gain.deeper", 1); }).toThrow(/amp\.gain/);
  });

  it("names the available fields when a path is rejected", () => {
    const obj: Record<string, unknown> = { amp: { gain: 10, level: 100, treble: 50 } };

    expect(() => { setByPath(obj, "amp.middle", 1); }).toThrow(/gain, level, treble/);
  });
});

describe("copyPatch", () => {
  it("replaces the destination patch and leaves the file length unchanged", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    const source = makePatch("Lead");
    files.set("src.tsl", { name: "Src", device: "FAKE", patches: [source] });
    files.set("dst.tsl", { name: "Dst", device: "FAKE", patches: [makePatch("Old"), makePatch("Keep")] });

    const copied = copyPatch(driver, { src: "src.tsl", srcRef: "0", dst: "dst.tsl", dstRef: "0" });

    expect(copied).toEqual({ name: "Lead", fromIndex: 0, toIndex: 0 });
    expect(files.get("dst.tsl")?.patches).toEqual([source, makePatch("Keep")]);
  });

  it("resolves both ends by patch name", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    files.set("src.tsl", { name: "Src", device: "FAKE", patches: [makePatch("Clean"), makePatch("Lead")] });
    files.set("dst.tsl", { name: "Dst", device: "FAKE", patches: [makePatch("Target")] });

    const copied = copyPatch(driver, { src: "src.tsl", srcRef: "Lead", dst: "dst.tsl", dstRef: "Target" });

    expect(copied).toEqual({ name: "Lead", fromIndex: 1, toIndex: 0 });
  });

  it("rejects a destination index past the end rather than leaving a hole in the array", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    files.set("src.tsl", { name: "Src", device: "FAKE", patches: [makePatch("Lead")] });
    files.set("dst.tsl", { name: "Dst", device: "FAKE", patches: [makePatch("Only")] });

    const copyPastEnd = () => copyPatch(driver, { src: "src.tsl", srcRef: "0", dst: "dst.tsl", dstRef: "5" });

    expect(copyPastEnd, "names the index it was asked for").toThrow(/5/);
    expect(copyPastEnd, "and how many the file actually holds").toThrow(/1 patch/);
    expect(files.get("dst.tsl")?.patches).toHaveLength(1);
  });
});

describe("createPatchFile", () => {
  const dir = scratchDir();

  it("names the set after the file and opens with one blank patch by default", () => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    const path = join(dir(), "my-tones.tsl");

    const file = createPatchFile(driver, path);

    expect(file.name).toBe("my-tones");
    expect(file.patches).toHaveLength(1);
    expect(files.get(path)).toBe(file);
  });

  it("takes the given set name and patch count", () => {
    const driver = makeFakeDriver(new Map<string, PatchFile>());
    const path = join(dir(), "my-tones.tsl");

    const file = createPatchFile(driver, path, { setName: "Live Set", patchCount: 4 });

    expect(file.name).toBe("Live Set");
    expect(file.patches).toHaveLength(4);
  });

  it("refuses to overwrite an existing file, so a mistyped path can't cost a library", () => {
    const driver = makeFakeDriver(new Map<string, PatchFile>());
    const path = join(dir(), "taken.tsl");
    writeFileSync(path, "{}");

    const overwrite = () => createPatchFile(driver, path);

    expect(overwrite).toThrow(path);
  });

  // A count is the kind of input a mistyped exponent turns into 100 million blank patches, which
  // no device holds and which the surface asking for them sits and waits on.
  it.each([0, -1, 2.5, MAX_NEW_PATCHES + 1])("rejects a patch count of %o without writing", (patchCount) => {
    const files = new Map<string, PatchFile>();
    const driver = makeFakeDriver(files);
    const path = join(dir(), "junk.tsl");

    const createWithBadCount = () => createPatchFile(driver, path, { patchCount });

    expect(createWithBadCount).toThrow(String(MAX_NEW_PATCHES));
    expect(files.has(path)).toBe(false);
  });

  it("takes the largest count it allows", () => {
    const driver = makeFakeDriver(new Map<string, PatchFile>());
    const path = join(dir(), "full.tsl");

    const file = createPatchFile(driver, path, { patchCount: MAX_NEW_PATCHES });

    expect(file.patches).toHaveLength(MAX_NEW_PATCHES);
  });
});
