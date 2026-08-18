import { afterEach, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFile } from "../src/devices/gx1/tsl";
import { RAW } from "../src/devices/gx1/common";
import type { Patch } from "../src/devices/gx1/types";

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
const patchAt = (path: string, index = 0): Patch =>
  present(readFile(path).patches[index], `patch ${index} of ${path}`);

/** One raw block of a decoded patch, by the name the file gives it (`"MEMORY%DLY"`). */
const rawBlock = (patch: Patch, key: string): string[] =>
  present(patch[RAW][key], `${key} of the decoded patch`);

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
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tonesmith-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
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
  present, patchAt, rawBlock, scratchDir, scratchFile,
};
