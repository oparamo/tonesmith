import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Patch, PatchFile, PatchDriver } from "../../src/model";
import {
  resolvePatch, resolvePatches, readPatchFile, editPatchFile, upsertPatches, copyPatch,
  createPatchFile, MAX_NEW_PATCHES,
} from "../../src/service/patchService";
import { pathExists, scratchDir } from "../helpers";

const makePatch = (name: string): Patch =>
  ({ name });

/**
 * A PatchDriver stand-in whose format is plain JSON, so these suites exercise the interface alone,
 * not gx1 specifics. The files themselves are real: patchService reads and writes the disk for every
 * driver.
 */
const makeFakeDriver = (): PatchDriver => ({
  id: "fake",
  name: "Fake",
  capabilities: { chain: { description: "", defaultOrder: [], blocks: {} }, patchName: { maxLength: 16 }, patchSettings: [], groups: [] },
  parseFile: (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as PatchFile,
  serializeFile: (file) => new TextEncoder().encode(JSON.stringify(file)),
  newFile: (setName, nPatches = 1) => ({
    name: setName, device: "FAKE",
    patches: Array.from({ length: nPatches }, () => makePatch("blank")),
  }),
  buildPatch: (spec) => makePatch((spec as { name: string }).name),
  applyEdits: (_, edits) => Object.fromEntries(edits),
  viewPatch: (patch) => ({ name: patch.name, details: [], blocks: [] }),
});

/**
 * Wraps a fake driver to count how many times it decodes or encodes a file, which happens exactly
 * once per read or write of the disk.
 */
const makeCountingDriver = (): { driver: PatchDriver; counts: { reads: number; writes: number } } => {
  const base = makeFakeDriver();
  const counts = { reads: 0, writes: 0 };
  const driver: PatchDriver = {
    ...base,
    parseFile: (bytes, source) => {
      counts.reads += 1;
      return base.parseFile(bytes, source);
    },
    serializeFile: (file) => {
      counts.writes += 1;
      return base.serializeFile(file);
    },
  };
  return { driver, counts };
};

/** Writes a fake driver's file to disk directly, for tests that need a file already in place. */
const seedFile = async (path: string, file: PatchFile): Promise<void> => {
  await writeFile(path, JSON.stringify(file));
};

/** Reads a fake driver's file back off disk. */
const loadFile = async (path: string): Promise<PatchFile> =>
  JSON.parse(await readFile(path, "utf8")) as PatchFile;

/**
 * A fake driver whose edits land: each path names a top-level field of the patch. A path starting
 * "bad" is refused, standing in for a field the device doesn't have.
 */
const makeEditingDriver = (): PatchDriver => ({
  ...makeFakeDriver(),
  applyEdits: (patch, edits) => {
    const refused = edits.filter(([path]) => path.startsWith("bad"));
    if (refused.length > 0) throw new Error(`No field ${refused.map(([path]) => path).join(", ")}`);
    for (const [path, value] of edits) (patch as unknown as Record<string, unknown>)[path] = value;
    return Object.fromEntries(edits);
  },
});

describe("editPatchFile", () => {
  const dir = scratchDir();
  const seeded = async (): Promise<string> => {
    const path = join(dir(), "set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Clean")] });
    return path;
  };

  it("applies every edit to the patch the ref names and reports what it wrote", async () => {
    const path = await seeded();

    const report = await editPatchFile(makeEditingDriver(), path, { ref: "Clean", fields: [["gain", 40], ["key", "G"]] });

    expect(report).toStrictEqual({ index: 1, applied: { gain: 40, key: "G" } });
    const [, clean] = (await loadFile(path)).patches;
    expect(clean).toMatchObject({ gain: 40, key: "G" });
  });

  it("renames the set without a ref, and does both in one write when asked", async () => {
    const path = await seeded();
    const driver = makeEditingDriver();

    await editPatchFile(driver, path, { setName: "Renamed" });
    const both = await editPatchFile(driver, path, { ref: "0", fields: [["gain", 5]], setName: "Both" });

    expect(both).toStrictEqual({ index: 0, applied: { gain: 5 }, setName: "Both" });
    const file = await loadFile(path);
    expect(file.name).toBe("Both");
    expect(file.patches[0]).toMatchObject({ gain: 5 });
  });

  // Every edit lands in memory before the write, so a refusal anywhere in the batch leaves the file
  // byte for byte as it was rather than half-applied.
  it("writes nothing when any edit in the batch is refused", async () => {
    const path = await seeded();
    const before = await readFile(path, "utf8");

    const refused = editPatchFile(makeEditingDriver(), path, { ref: "0", fields: [["gain", 1], ["badField", 2]] });

    await expect(refused).rejects.toThrow("badField");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it.each([
    ["nothing to change", {}],
    ["fields without a ref", { fields: [["gain", 1]] as const }],
  ])("rejects %s without touching the file", async (_, request) => {
    const path = await seeded();
    const before = await readFile(path, "utf8");

    await expect(editPatchFile(makeEditingDriver(), path, request)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(before);
  });
});

// Two calls on one file that interleave (read, read, write, write) lose the first call's change.
// Each case starts both calls before either finishes; without the per-file lock, one change is gone.
describe("concurrent changes to one file", () => {
  const dir = scratchDir();

  it("keeps both of two edits made at once to different patches", async () => {
    const path = join(dir(), "set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Clean")] });
    const driver = makeEditingDriver();

    await Promise.all([
      editPatchFile(driver, path, { ref: "0", fields: [["gain", 10]] }),
      editPatchFile(driver, path, { ref: "1", fields: [["gain", 20]] }),
    ]);

    const [lead, clean] = (await loadFile(path)).patches;
    expect(lead).toMatchObject({ gain: 10 });
    expect(clean).toMatchObject({ gain: 20 });
  });

  it("keeps both patches of two saves made at once", async () => {
    const path = join(dir(), "set.tsl");
    const driver = makeFakeDriver();

    await Promise.all([
      upsertPatches(driver, { path, patches: [makePatch("Lead")] }),
      upsertPatches(driver, { path, patches: [makePatch("Clean")] }),
    ]);

    const names = (await readPatchFile(driver, path)).patches.map(patch => patch.name).sort();
    expect(names).toStrictEqual(["Clean", "Lead"]);
  });

  it("lets exactly one of two creates on one path succeed", async () => {
    const path = join(dir(), "new.tsl");
    const driver = makeFakeDriver();

    const outcomes = await Promise.allSettled([
      createPatchFile(driver, path, { setName: "First" }),
      createPatchFile(driver, path, { setName: "Second" }),
    ]);

    const statuses = outcomes.map(outcome => outcome.status).sort();
    expect(statuses).toStrictEqual(["fulfilled", "rejected"]);
  });

  it("still runs a queued change after the one ahead of it fails", async () => {
    const path = join(dir(), "set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead")] });
    const driver = makeEditingDriver();

    const [failed, landed] = await Promise.allSettled([
      editPatchFile(driver, path, { ref: "0", fields: [["badField", 1]] }),
      editPatchFile(driver, path, { ref: "0", fields: [["gain", 7]] }),
    ]);

    expect(failed.status).toBe("rejected");
    expect(landed.status).toBe("fulfilled");
    expect((await loadFile(path)).patches[0]).toMatchObject({ gain: 7 });
  });
});

describe("upsertPatches", () => {
  const dir = scratchDir();
  const pathTo = (name: string): string => join(dir(), name);

  it("creates the file and saves every patch in array order", async () => {
    const driver = makeFakeDriver();
    const patches = [makePatch("First"), makePatch("Second"), makePatch("Third")];
    const path = pathTo("set.tsl");

    const { file } = await upsertPatches(driver, { path, patches });

    expect(file.patches).toStrictEqual(patches);
    expect(await loadFile(path)).toStrictEqual(file);
  });

  it("replaces same-named patches and appends the rest, in one pass", async () => {
    const driver = makeFakeDriver();
    const path = pathTo("set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Rhythm")] });
    const patches = [makePatch("Rhythm"), makePatch("Solo")];

    const { file } = await upsertPatches(driver, { path, patches });
    const patchNames = file.patches.map(patch => patch.name);

    expect(patchNames, "Rhythm replaced in place, Solo appended").toStrictEqual(["Lead", "Rhythm", "Solo"]);
  });

  it("keys on the name exactly, so a name differing only in case is a patch of its own", async () => {
    const driver = makeFakeDriver();
    const path = pathTo("set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("LEAD")] });

    const { file, saved } = await upsertPatches(driver, { path, patches: [makePatch("lead"), makePatch("Lead")] });
    const patchNames = file.patches.map(patch => patch.name);

    expect(patchNames).toStrictEqual(["LEAD", "lead", "Lead"]);
    expect(saved.map(entry => entry.action)).toStrictEqual(["appended", "appended"]);
  });

  it("stays idempotent across reruns of the same batch", async () => {
    const driver = makeFakeDriver();
    const path = pathTo("set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Rhythm")] });
    const patches = [makePatch("Rhythm")];

    await upsertPatches(driver, { path, patches });
    const { file } = await upsertPatches(driver, { path, patches });
    const patchNames = file.patches.map(patch => patch.name);

    expect(patchNames).toStrictEqual(["Lead", "Rhythm"]);
  });

  // The whole point of the batch form: a set lands as one atomic write, not one cycle per patch.
  it("reads and writes the file exactly once however many patches are saved", async () => {
    const path = pathTo("set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [] });
    const { driver, counts } = makeCountingDriver();
    const patches = [makePatch("One"), makePatch("Two"), makePatch("Three"), makePatch("Four")];

    await upsertPatches(driver, { path, patches });

    expect(counts.reads).toBe(1);
    expect(counts.writes).toBe(1);
  });

  it("propagates a non-ENOENT error raised while reading an existing file", async () => {
    const path = pathTo("set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [] });
    const driver: PatchDriver = {
      ...makeFakeDriver(),
      parseFile: () => { throw new Error("disk on fire"); },
    };

    const upsertWithBrokenParse = upsertPatches(driver, { path, patches: [makePatch("Lead")] });

    await expect(upsertWithBrokenParse).rejects.toThrow("disk on fire");
  });

  it("names a freshly created file after setName when given, else after the first patch", async () => {
    const driver = makeFakeDriver();
    const patches = [makePatch("First"), makePatch("Second")];

    const named = await upsertPatches(driver, { path: pathTo("named.tsl"), patches, setName: "My Library" });
    expect(named.file.name).toBe("My Library");

    const unnamed = await upsertPatches(driver, { path: pathTo("unnamed.tsl"), patches });
    expect(unnamed.file.name).toBe("First");
  });

  it("renames an existing set when setName is given, and preserves it when omitted", async () => {
    const driver = makeFakeDriver();
    const path = pathTo("set.tsl");
    await seedFile(path, { name: "Old Name", device: "FAKE", patches: [makePatch("Lead")] });

    const kept = await upsertPatches(driver, { path, patches: [makePatch("Rhythm")] });
    expect(kept.file.name).toBe("Old Name");

    const renamed = await upsertPatches(driver, {
      path,
      patches: [makePatch("Solo")],
      setName: "New Name",
    });
    expect(renamed.file.name).toBe("New Name");
  });

  // The saving surfaces tell a caller what became of each patch. Reading the file back to work it
  // out costs a second decode of everything, and undoes this call's read-once/write-once property.
  it("reports the file as created and says what happened to each patch", async () => {
    const driver = makeFakeDriver();
    const setPath = pathTo("set.tsl");
    await seedFile(setPath, { name: "Set", device: "FAKE", patches: [makePatch("Lead")] });

    const solo = makePatch("Solo");
    const [lead, clean] = [makePatch("Lead"), makePatch("Clean")];
    const fresh = await upsertPatches(driver, { path: pathTo("new.tsl"), patches: [solo] });
    const existing = await upsertPatches(driver, { path: setPath, patches: [lead, clean] });

    expect(fresh.created).toBe(true);
    expect(fresh.saved).toStrictEqual([{ name: "Solo", action: "appended", patch: solo }]);
    expect(existing.created).toBe(false);
    expect(existing.saved).toStrictEqual([
      { name: "Lead", action: "replaced", patch: lead },
      { name: "Clean", action: "appended", patch: clean },
    ]);
  });

  it("rejects an empty batch rather than writing an unnamed file", async () => {
    const driver = makeFakeDriver();

    const upsertNothing = upsertPatches(driver, { path: pathTo("set.tsl"), patches: [] });

    await expect(upsertNothing).rejects.toThrow();
  });

  // A save keys on the name, so a repeat within one batch cannot be honored: the second patch
  // replaces the first, and the report would say both were saved when only one survives.
  it("rejects a name repeated within one batch, naming it and both positions", async () => {
    const driver = makeFakeDriver();
    const path = pathTo("set.tsl");
    const patches = [makePatch("Lead"), makePatch("Clean"), makePatch("Lead")];

    const upsertRepeatedName = upsertPatches(driver, { path, patches });

    await expect(upsertRepeatedName).rejects.toThrow(/Lead/);
    await expect(upsertRepeatedName).rejects.toThrow(/0/);
    await expect(upsertRepeatedName).rejects.toThrow(/2/);
    expect(await pathExists(path), "nothing is written when the batch is rejected").toBe(false);
  });

  describe("given specs", () => {
    /** A fake driver that refuses to build any spec carrying `bad`, saying which block it was. */
    const makeBuildingDriver = (): PatchDriver => ({
      ...makeFakeDriver(),
      buildPatch: (spec) => {
        const { name, bad } = spec as { name: string; bad?: boolean };
        if (bad === true) throw new Error("fx1: unknown param wobble");
        return makePatch(name);
      },
    });

    it("builds each spec through the driver and saves them in spec order", async () => {
      const path = pathTo("set.tsl");

      const { saved } = await upsertPatches(makeBuildingDriver(), { path, specs: [{ name: "One" }, { name: "Two" }] });
      const savedNames = (await loadFile(path)).patches.map(patch => patch.name);

      expect(saved.map(entry => entry.patch)).toStrictEqual([makePatch("One"), makePatch("Two")]);
      expect(savedNames).toStrictEqual(["One", "Two"]);
    });

    // The same block tends to appear in every spec of a batch, so the driver's message alone
    // leaves the caller guessing which patch it came from.
    it("names the position and name of a spec the driver rejects, and writes nothing", async () => {
      const path = pathTo("set.tsl");
      const specs = [{ name: "Good" }, { name: "Bad One", bad: true }];

      const upsertBadSpec = upsertPatches(makeBuildingDriver(), { path, specs });

      await expect(upsertBadSpec).rejects.toThrow(/1/);
      await expect(upsertBadSpec).rejects.toThrow(/Bad One/);
      await expect(upsertBadSpec, "carries the driver's reason through").rejects.toThrow(/wobble/);
      expect(await pathExists(path)).toBe(false);
    });

    it("rejects specs that build to the same name", async () => {
      const path = pathTo("set.tsl");

      const upsertRepeatedName = upsertPatches(makeBuildingDriver(), { path, specs: [{ name: "Lead" }, { name: "Lead" }] });

      await expect(upsertRepeatedName).rejects.toThrow(/Lead/);
      expect(await pathExists(path)).toBe(false);
    });
  });
});

describe("resolvePatch", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Rock Lead")];

  it("returns numeric index when ref is the integer string", () => {
    const index = resolvePatch(patches, "1").index;

    expect(index).toBe(1);
  });

  // The device stores "Lead" and "LEAD" as two names, so a case-blind match would leave a file
  // holding both with neither reachable by name.
  it("matches a name exactly, case included", () => {
    const withCaseVariant = [...patches, makePatch("CLEAN JAZZ")];

    expect(resolvePatch(withCaseVariant, "Clean Jazz").index).toBe(1);
    expect(resolvePatch(withCaseVariant, "CLEAN JAZZ").index).toBe(3);
    expect(() => resolvePatch(withCaseVariant, "clean jazz")).toThrow(/clean jazz/);
  });

  it("throws when no patch matches the name", () => {
    const resolveMissingName = () => resolvePatch(patches, "Metal").index;

    expect(resolveMissingName).toThrow(/Metal/);
  });

  // Callers index straight into the array with what this returns, so an unchecked index reads as
  // undefined, or on a write leaves a hole that encodes as a corrupt file.
  it("throws for an index past the last patch", () => {
    const resolvePastEnd = () => resolvePatch(patches, "3").index;

    expect(resolvePastEnd).toThrow(/3/);
  });

  it("throws for a negative index", () => {
    const resolveNegative = () => resolvePatch(patches, "-1").index;

    expect(resolveNegative).toThrow(/-1/);
  });

  it("throws when multiple patches share the same name", () => {
    const resolveAmbiguousName = () => resolvePatch(patches, "Rock Lead").index;

    expect(resolveAmbiguousName).toThrow(/Rock Lead/);
    expect(resolveAmbiguousName, "names both colliding indices").toThrow(/0.*2|2.*0/);
  });

  // Every surface takes the ref as a bare string, so an omitted one arrives here as "". Read as a
  // number it is 0, which would select the first patch and, on a write, overwrite it.
  it.each(["", "   "])("rejects %o rather than selecting the first patch", (ref) => {
    const resolveEmpty = () => resolvePatch(patches, ref).index;

    expect(resolveEmpty).toThrow();
  });

  it("reads a padded integer as that index", () => {
    const index = resolvePatch(patches, " 1 ").index;

    expect(index).toBe(1);
  });

  // Number() accepts both of these and rounds them into an index, which would select a patch
  // the caller never spelled out.
  it.each(["0x1", "2.0"])("does not read %o as an index", (ref) => {
    const resolveNonIndex = () => resolvePatch(patches, ref).index;

    expect(resolveNonIndex).toThrow(new RegExp(ref.replace(".", "\\.")));
  });

  it("finds a patch whose name is all digits once no such index exists", () => {
    const withNumericName = [...patches, makePatch("808")];

    expect(resolvePatch(withNumericName, "808").index).toBe(3);
  });
});

describe("resolvePatches", () => {
  const patches = [makePatch("Rock Lead"), makePatch("Clean Jazz"), makePatch("Metal")];

  it("returns every patch in file order when ref is omitted", () => {
    const selected = resolvePatches(patches);

    expect(selected.map(entry => entry.index)).toStrictEqual([0, 1, 2]);
    expect(selected.map(entry => entry.patch)).toStrictEqual(patches);
  });

  it("returns the one patch a ref names, with the index it sits at", () => {
    const selected = resolvePatches(patches, "1");

    expect(selected).toStrictEqual([{ index: 1, patch: patches[1] }]);
  });

  it("propagates a ref that names no patch", () => {
    const resolveMissingName = () => resolvePatches(patches, "Bogus");

    expect(resolveMissingName).toThrow(/Bogus/);
  });
});

describe("copyPatch", () => {
  const dir = scratchDir();
  const pathTo = (name: string): string => join(dir(), name);

  it("replaces the destination patch and leaves the file length unchanged", async () => {
    const driver = makeFakeDriver();
    const source = makePatch("Lead");
    const srcPath = pathTo("src.tsl");
    const dstPath = pathTo("dst.tsl");
    await seedFile(srcPath, { name: "Src", device: "FAKE", patches: [source] });
    await seedFile(dstPath, { name: "Dst", device: "FAKE", patches: [makePatch("Old"), makePatch("Keep")] });

    const copied = await copyPatch(driver, { src: srcPath, srcRef: "0", dst: dstPath, dstRef: "0" });

    expect(copied).toStrictEqual({ name: "Lead", fromIndex: 0, toIndex: 0 });
    expect((await loadFile(dstPath)).patches).toStrictEqual([source, makePatch("Keep")]);
  });

  it("resolves both ends by patch name", async () => {
    const driver = makeFakeDriver();
    const srcPath = pathTo("src.tsl");
    const dstPath = pathTo("dst.tsl");
    await seedFile(srcPath, { name: "Src", device: "FAKE", patches: [makePatch("Clean"), makePatch("Lead")] });
    await seedFile(dstPath, { name: "Dst", device: "FAKE", patches: [makePatch("Target")] });

    const copied = await copyPatch(driver, { src: srcPath, srcRef: "Lead", dst: dstPath, dstRef: "Target" });

    expect(copied).toStrictEqual({ name: "Lead", fromIndex: 1, toIndex: 0 });
  });

  it("rejects a destination index past the end rather than leaving a hole in the array", async () => {
    const driver = makeFakeDriver();
    const srcPath = pathTo("src.tsl");
    const dstPath = pathTo("dst.tsl");
    await seedFile(srcPath, { name: "Src", device: "FAKE", patches: [makePatch("Lead")] });
    await seedFile(dstPath, { name: "Dst", device: "FAKE", patches: [makePatch("Only")] });

    const copyPastEnd = copyPatch(driver, { src: srcPath, srcRef: "0", dst: dstPath, dstRef: "5" });

    await expect(copyPastEnd, "names the index it was asked for").rejects.toThrow(/5/);
    await expect(copyPastEnd, "and how many the file actually holds").rejects.toThrow(/1 patch/);
    expect((await loadFile(dstPath)).patches).toHaveLength(1);
  });
});

describe("createPatchFile", () => {
  const dir = scratchDir();

  it("names the set after the file and opens with one blank patch by default", async () => {
    const driver = makeFakeDriver();
    const path = join(dir(), "my-tones.tsl");

    const file = await createPatchFile(driver, path);

    expect(file.name).toBe("my-tones");
    expect(file.patches).toHaveLength(1);
    expect(await loadFile(path)).toStrictEqual(file);
  });

  it("takes the given set name and patch count", async () => {
    const driver = makeFakeDriver();
    const path = join(dir(), "my-tones.tsl");

    const file = await createPatchFile(driver, path, { setName: "Live Set", patchCount: 4 });

    expect(file.name).toBe("Live Set");
    expect(file.patches).toHaveLength(4);
  });

  it("refuses to overwrite an existing file, so a mistyped path can't cost a library", async () => {
    const driver = makeFakeDriver();
    const path = join(dir(), "taken.tsl");
    await writeFile(path, "{}");

    const overwrite = createPatchFile(driver, path);

    await expect(overwrite).rejects.toThrow(path);
  });

  // A count is the kind of input a mistyped exponent turns into 100 million blank patches, which
  // no device holds and which the surface asking for them sits and waits on.
  it.each([0, -1, 2.5, MAX_NEW_PATCHES + 1])("rejects a patch count of %o without writing", async (patchCount) => {
    const driver = makeFakeDriver();
    const path = join(dir(), "junk.tsl");

    const createWithBadCount = createPatchFile(driver, path, { patchCount });

    await expect(createWithBadCount).rejects.toThrow(String(MAX_NEW_PATCHES));
    expect(await pathExists(path)).toBe(false);
  });

  it("takes the largest count it allows", async () => {
    const driver = makeFakeDriver();
    const path = join(dir(), "full.tsl");

    const file = await createPatchFile(driver, path, { patchCount: MAX_NEW_PATCHES });

    expect(file.patches).toHaveLength(MAX_NEW_PATCHES);
  });
});
