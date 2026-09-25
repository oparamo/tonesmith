/**
 * The only code that reads or writes a patch file. Every write happens inside one of the locked
 * operations below, which is what lets the service layer change a file without two changes to it
 * interleaving and one of them being lost.
 */
import { access, readFile } from "node:fs/promises";
import { writeFileAtomic } from "./atomicWrite";
import { withFileLock } from "./fileLock";
import type { Patch, PatchFile, PatchDriver } from "../model";


/**
 * Reads and decodes the patch file at `path`. Needs no lock: every write lands by rename, so a read
 * sees a whole file, old or new, never one partway written.
 */
const readPatchFile = async <T extends Patch>(driver: PatchDriver<T>, path: string): Promise<PatchFile<T>> => {
  const bytes = await readFile(path);
  return driver.parseFile(bytes, path);
};

const writePatchFile = <T extends Patch>(driver: PatchDriver<T>, file: PatchFile<T>, path: string): Promise<void> =>
  writeFileAtomic(path, driver.serializeFile(file));

/**
 * Reads `path`, runs `change` on it and writes it back, holding the file's lock throughout, and
 * returns what `change` returned. This is the one read-change-write shape an existing file goes
 * through, so no caller can await something between the read and the write and lose an edit.
 */
const updatePatchFile = <T extends Patch, R>(
  driver: PatchDriver<T>,
  path: string,
  change: (file: PatchFile<T>) => R,
): Promise<R> =>
  withFileLock(path, async () => {
    const file = await readPatchFile(driver, path);
    const result = change(file);
    await writePatchFile(driver, file, path);
    return result;
  });

/** Whether a filesystem call failed because nothing exists at the path, as opposed to any other reason. */
const isMissingFile = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Reads `path`, or starts a fresh empty file named `setName` when it doesn't exist yet. */
const readExistingOrNew = async <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  setName: string,
): Promise<{ file: PatchFile<T>; created: boolean }> => {
  try {
    return { file: await readPatchFile(driver, path), created: false };
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    return { file: driver.newFile(setName, 0), created: true };
  }
};

/** What a change to a file that may not exist yet returned, and whether it started the file. */
interface Upserted<R> {
  result: R;
  created: boolean;
}

/**
 * `updatePatchFile` for a path that may hold nothing yet: a missing file is started empty, named
 * `setName`, and handed to `change` like any other. The lock covers that decision too, or two first
 * saves to one path would each start a file of their own.
 */
const upsertPatchFile = <T extends Patch, R>(
  driver: PatchDriver<T>,
  target: { path: string; setName: string },
  change: (file: PatchFile<T>) => R,
): Promise<Upserted<R>> =>
  withFileLock(target.path, async () => {
    const { file, created } = await readExistingOrNew(driver, target.path, target.setName);
    const result = change(file);
    await writePatchFile(driver, file, target.path);
    return { result, created };
  });

/**
 * Whether `path` is free to create. Only a missing file counts as free: a permission error says
 * nothing about what sits there, so it is rethrown rather than read as room to write.
 */
const isPathFree = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return false;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    return true;
  }
};

/**
 * Writes `file` to `path`, refusing when anything is already there, since a caller starting a file
 * would lose a library to a mistyped path. The check and the write share one lock, or two creates on
 * one path could both find it free.
 */
const writeNewPatchFile = <T extends Patch>(driver: PatchDriver<T>, path: string, file: PatchFile<T>): Promise<void> =>
  withFileLock(path, async () => {
    const pathFree = await isPathFree(path);
    if (!pathFree) throw new Error(`${path} already exists, refusing to overwrite it.`);
    await writePatchFile(driver, file, path);
  });

export { readPatchFile, updatePatchFile, upsertPatchFile, writeNewPatchFile };
export type { Upserted };
