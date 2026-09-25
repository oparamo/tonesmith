import { afterEach, beforeEach } from "vitest";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseFile } from "../src/device/gx1/format/tsl";
import { RAW } from "../src/device/gx1/model";
import type { Patch } from "../src/device/gx1/model";

/** Both fixtures anchored off this file, so no suite hand-counts its own way up the tree. */
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const ROCK_TONES_FIXTURE = resolve(REPO_ROOT, "fixtures/gx1/rock-tones.tsl");
const DEFAULT_INIT_FIXTURE = resolve(import.meta.dirname, "fixtures/gx1/default-init.tsl");

/** What the committed fixture holds, so a suite can assert its contents rather than that it has any. */
const ROCK_TONES_SET_NAME = "Rock Tones";
const ROCK_TONES_PATCH_NAMES = ["SWORD LEAD", "DROPTUNE RIFF", "GLASSY DIST", "FAT DIST"];

/**
 * A value the suite has already established is there: a patch of a committed fixture, a raw block
 * every patch carries. Failing here says which one was missing, where the alternative is a cascade
 * of assertions against `undefined`.
 */
const present = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Expected ${what}, got nothing`);
  return value;
};

/** The patch at `index` of the fixture at `path`. */
const patchAt = async (path: string, index = 0): Promise<Patch> => {
  const bytes = await readFile(path);
  return present(parseFile(bytes, path).patches[index], `patch ${index} of ${path}`);
};

/** One raw block of a decoded patch, by the name the file gives it (`"MEMORY%DLY"`). */
const rawBlock = (patch: Patch, key: string): string[] =>
  present(patch[RAW][key], `${key} of the decoded patch`);

/** `chain` with `block` moved to sit immediately before `before`, for building a reordered chain. */
const moveBefore = (chain: readonly string[], block: string, before: string): string[] => {
  const without = chain.filter(name => name !== block);
  const index = without.indexOf(before);
  return [...without.slice(0, index), block, ...without.slice(index)];
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

export {
  ROCK_TONES_FIXTURE, DEFAULT_INIT_FIXTURE, ROCK_TONES_SET_NAME, ROCK_TONES_PATCH_NAMES,
  present, patchAt, rawBlock, moveBefore, pathExists, scratchDir, scratchFile,
};
