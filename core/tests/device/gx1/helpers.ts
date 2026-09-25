import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseFile } from "../../../src/device/gx1/format/tsl";
import { RAW } from "../../../src/device/gx1/model";
import type { Patch } from "../../../src/device/gx1/model";
import { present } from "../../helpers";

/** Both fixtures anchored off this file, so no suite hand-counts its own way up the tree. */
const REPO_ROOT = resolve(import.meta.dirname, "../../../..");
const ROCK_TONES_FIXTURE = resolve(REPO_ROOT, "fixtures/gx1/rock-tones.tsl");
const DEFAULT_INIT_FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/default-init.tsl");

/** What the committed fixture holds, so a suite can assert its contents rather than that it has any. */
const ROCK_TONES_SET_NAME = "Rock Tones";
const ROCK_TONES_PATCH_NAMES = ["SWORD LEAD", "DROPTUNE RIFF", "GLASSY DIST", "FAT DIST"];

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

export {
  ROCK_TONES_FIXTURE, DEFAULT_INIT_FIXTURE, ROCK_TONES_SET_NAME, ROCK_TONES_PATCH_NAMES,
  patchAt, rawBlock, moveBefore,
};
