/**
 * The one place that reads or writes a patch file, held against a fake JSON driver and real temp
 * files. patchService's own suite covers the higher-level read-change-write shapes built on these;
 * this one covers the locked operations themselves.
 */
import { describe, it, expect } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Patch, PatchFile, PatchDriver } from "../../src/model";
import { readPatchFile, updatePatchFile, upsertPatchFile, writeNewPatchFile } from "../../src/persistence/patchFileRepository";
import { pathExists, present, scratchDir } from "../helpers";

const makePatch = (name: string): Patch => ({ name });

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

/** Wraps a fake driver to count how many times it decodes or encodes a file. */
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

const seedFile = async (path: string, file: PatchFile): Promise<void> => {
  await writeFile(path, JSON.stringify(file));
};

const loadFile = async (path: string): Promise<PatchFile> =>
  JSON.parse(await readFile(path, "utf8")) as PatchFile;

describe("readPatchFile", () => {
  const dir = scratchDir();

  it("hands the file's bytes and the path to driver.parseFile", async () => {
    const path = join(dir(), "set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead")] });
    const base = makeFakeDriver();
    let seenPath = "";
    const spyDriver: PatchDriver = {
      ...base,
      parseFile: (bytes, source) => { seenPath = source; return base.parseFile(bytes, source); },
    };

    const file = await readPatchFile(spyDriver, path);

    expect(file.patches).toStrictEqual([makePatch("Lead")]);
    expect(seenPath).toBe(path);
  });

  it("rejects with ENOENT for a missing file", async () => {
    const path = join(dir(), "missing.tsl");

    await expect(readPatchFile(makeFakeDriver(), path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("updatePatchFile", () => {
  const dir = scratchDir();
  const seeded = async (): Promise<string> => {
    const path = join(dir(), "set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead")] });
    return path;
  };

  it("writes what change did and returns what change returned", async () => {
    const path = await seeded();

    const result = await updatePatchFile(makeFakeDriver(), path, (file) => {
      present(file.patches[0], "the seeded patch").name = "Renamed";
      return "changed";
    });

    expect(result).toBe("changed");
    expect(present((await loadFile(path)).patches[0], "the reloaded patch").name).toBe("Renamed");
  });

  it("rejects for a missing file and creates nothing", async () => {
    const path = join(dir(), "missing.tsl");

    await expect(updatePatchFile(makeFakeDriver(), path, (file) => file)).rejects.toThrow();
    expect(await pathExists(path)).toBe(false);
  });

  it("leaves the file unchanged when change throws, and rethrows", async () => {
    const path = await seeded();
    const before = await readFile(path, "utf8");

    const attempt = updatePatchFile(makeFakeDriver(), path, () => { throw new Error("no field bogus"); });

    await expect(attempt).rejects.toThrow("no field bogus");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("decodes once and encodes once", async () => {
    const path = await seeded();
    const { driver, counts } = makeCountingDriver();

    await updatePatchFile(driver, path, (file) => file);

    expect(counts.reads).toBe(1);
    expect(counts.writes).toBe(1);
  });

  it("lands both of two concurrent calls on one file", async () => {
    const path = join(dir(), "shared.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead"), makePatch("Clean")] });
    const driver = makeFakeDriver();

    await Promise.all([
      updatePatchFile(driver, path, (file) => { present(file.patches[0], "the first patch").name = "Lead2"; return undefined; }),
      updatePatchFile(driver, path, (file) => { present(file.patches[1], "the second patch").name = "Clean2"; return undefined; }),
    ]);

    const names = (await loadFile(path)).patches.map(patch => patch.name);
    expect(names).toStrictEqual(["Lead2", "Clean2"]);
  });
});

describe("upsertPatchFile", () => {
  const dir = scratchDir();

  it("starts a missing file from driver.newFile(setName, 0) and reports created: true", async () => {
    const path = join(dir(), "new.tsl");

    const { result, created } = await upsertPatchFile(makeFakeDriver(), { path, setName: "Fresh" }, (file) => {
      file.patches.push(makePatch("Solo"));
      return "ok";
    });

    expect(created).toBe(true);
    expect(result).toBe("ok");
    const file = await loadFile(path);
    expect(file.name).toBe("Fresh");
    expect(file.patches).toStrictEqual([makePatch("Solo")]);
  });

  it("reports created: false for an existing file", async () => {
    const path = join(dir(), "set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead")] });

    const { created } = await upsertPatchFile(makeFakeDriver(), { path, setName: "Set" }, (file) => file);

    expect(created).toBe(false);
  });

  it("creates missing parent directories", async () => {
    const path = join(dir(), "nested", "deeper", "new.tsl");

    await upsertPatchFile(makeFakeDriver(), { path, setName: "Fresh" }, (file) => file);

    expect(await pathExists(path)).toBe(true);
  });

  it("rethrows a decode failure instead of starting a fresh file, and leaves the file as it was", async () => {
    const path = join(dir(), "set.tsl");
    await seedFile(path, { name: "Set", device: "FAKE", patches: [makePatch("Lead")] });
    const before = await readFile(path, "utf8");
    const driver: PatchDriver = { ...makeFakeDriver(), parseFile: () => { throw new Error("disk on fire"); } };

    const attempt = upsertPatchFile(driver, { path, setName: "Set" }, (file) => file);

    await expect(attempt).rejects.toThrow("disk on fire");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("rethrows a filesystem error other than ENOENT while reading", async () => {
    const path = join(dir(), "a-directory");
    await mkdir(path);

    const attempt = upsertPatchFile(makeFakeDriver(), { path, setName: "Set" }, (file) => file);

    await expect(attempt).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("lands both of two concurrent first upserts to one missing path", async () => {
    const path = join(dir(), "new.tsl");
    const driver = makeFakeDriver();

    await Promise.all([
      upsertPatchFile(driver, { path, setName: "First" }, (file) => { file.patches.push(makePatch("Lead")); return undefined; }),
      upsertPatchFile(driver, { path, setName: "Second" }, (file) => { file.patches.push(makePatch("Clean")); return undefined; }),
    ]);

    const names = (await loadFile(path)).patches.map(patch => patch.name).sort();
    expect(names).toStrictEqual(["Clean", "Lead"]);
  });
});

describe("writeNewPatchFile", () => {
  const dir = scratchDir();

  it("writes to a free path", async () => {
    const path = join(dir(), "new.tsl");
    const driver = makeFakeDriver();
    const file = driver.newFile("Fresh", 1);

    await writeNewPatchFile(driver, path, file);

    expect(await loadFile(path)).toStrictEqual(file);
  });

  it("refuses an existing path, naming it, and leaves the file as it was", async () => {
    const path = join(dir(), "taken.tsl");
    const driver = makeFakeDriver();
    await seedFile(path, { name: "Old", device: "FAKE", patches: [makePatch("Lead")] });
    const before = await readFile(path, "utf8");

    const attempt = writeNewPatchFile(driver, path, driver.newFile("New", 1));

    await expect(attempt).rejects.toThrow(path);
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it("rethrows an access error other than ENOENT", async () => {
    const filePath = join(dir(), "regular-file");
    await writeFile(filePath, "not a directory");
    const path = join(filePath, "set.tsl");
    const driver = makeFakeDriver();

    const attempt = writeNewPatchFile(driver, path, driver.newFile("New", 1));

    await expect(attempt).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("lets exactly one of two concurrent calls on one path succeed", async () => {
    const path = join(dir(), "new.tsl");
    const driver = makeFakeDriver();

    const outcomes = await Promise.allSettled([
      writeNewPatchFile(driver, path, driver.newFile("First", 1)),
      writeNewPatchFile(driver, path, driver.newFile("Second", 1)),
    ]);

    const statuses = outcomes.map(outcome => outcome.status).sort();
    expect(statuses).toStrictEqual(["fulfilled", "rejected"]);
  });
});
