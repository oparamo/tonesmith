import { afterEach, beforeEach } from "vitest";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Patch, PatchDriver } from "../src/model";

/**
 * A value the suite has already established is there: a patch of a committed fixture, a raw block
 * every patch carries. Failing here says which one was missing, where the alternative is a cascade
 * of assertions against `undefined`.
 */
const present = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Expected ${what}, got nothing`);
  return value;
};

/** Whether a path exists. Only a missing file answers no; any other failure is rethrown. */
const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
};

/**
 * A scratch directory of its own for every test in the calling suite, cleaned up after each one.
 * Call it in a `describe` body: it registers hooks against the suite being collected, and returns
 * a getter because the directory cannot exist until the test it belongs to starts.
 *
 * Named apart from cli's and mcp's `withTempDir`, which hand back a directory plus a `cleanup` the
 * caller has to run. Two helpers with one name and opposite contracts is worse than two names.
 */
const scratchDir = (): (() => string) => {
  let dir = "";
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "tonesmith-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
  return () => dir;
};

/**
 * A path in a scratch directory for every test in the calling suite, whether or not the test
 * writes anything there. Same call-in-a-`describe` rule as `scratchDir`.
 */
const scratchFile = (basename: string): (() => string) => {
  const dir = scratchDir();
  return () => join(dir(), basename);
};

/** `patch` as a file stores it: saved into a file of its own through the driver's format and read back. */
const storedAs = <T extends Patch>(driver: PatchDriver<T>, patch: T): T => {
  const file = driver.newFile("Stored", 0);
  file.patches.push(patch);
  return present(driver.parseFile(driver.serializeFile(file), "stored").patches[0], "the stored patch");
};

export { present, pathExists, scratchDir, scratchFile, storedAs };
