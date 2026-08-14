import { resolve } from "node:path";
import { readFile } from "../src/devices/gx1/tsl";
import { RAW } from "../src/devices/gx1/common";
import type { Patch } from "../src/devices/gx1/types";

/** Both fixtures anchored off this file, so no suite hand-counts its own way up the tree. */
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const ROCK_TONES_FIXTURE = resolve(REPO_ROOT, "fixtures/gx1/rock-tones.tsl");
const DEFAULT_INIT_FIXTURE = resolve(import.meta.dirname, "fixtures/gx1/default-init.tsl");

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

export { ROCK_TONES_FIXTURE, DEFAULT_INIT_FIXTURE, present, patchAt, rawBlock };
