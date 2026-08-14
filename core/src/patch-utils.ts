import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import type { FieldEdits, FieldValue, Patch, PatchFile, PatchDriver } from "./types";

/** A reference that names a slot rather than a patch: digits, optionally signed. */
const INDEX_REF = /^-?\d+$/;

/** Every index whose patch carries this name, matched whole and case-insensitively. */
const indicesNamed = (patches: Patch[], ref: string): number[] => {
  const needle = ref.toLowerCase();
  return patches.flatMap((patch, index) =>
    patch.name.trim().toLowerCase() === needle ? [index] : []
  );
};

/** The single patch a name picks out, or why it picks out none or several. */
const soleIndexNamed = (matches: number[], ref: string): number => {
  const [only] = matches;
  if (only === undefined) throw new Error(`No patch named "${ref}"`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous name "${ref}": matches indices ${matches.join(", ")}`);
  }
  return only;
};

/**
 * Resolves an index string or an exact patch name to an array index.
 *
 * Which of the two a ref is comes from its shape, not from `Number`, whose idea of an index is wide
 * enough to be dangerous: it reads `""` as 0, so a ref left out by a caller selected the first
 * patch and, on a write, overwrote it, and it rounds `"0x1"` and `"2.0"` into indices the caller
 * never spelled out.
 *
 * An index past the end is rejected rather than passed through: callers index straight into
 * `patches` with the result, so an unchecked one reads as `undefined` or, on a write, leaves a hole
 * in the array that encodes as a corrupt file. Ruling it out is also what makes a patch named "808"
 * reachable, since a digits-only ref is read as an index first.
 */
const resolvePatchIndex = (patches: Patch[], ref: string): number => {
  const trimmed = ref.trim();
  if (trimmed.length === 0) throw new Error("Empty patch reference: give an index or a patch name.");

  const named = indicesNamed(patches, trimmed);
  if (!INDEX_REF.test(trimmed)) return soleIndexNamed(named, trimmed);

  const index = Number(trimmed);
  if (index >= 0 && index < patches.length) return index;
  if (named.length === 0) {
    throw new Error(`No patch at index ${index}: the file holds ${patches.length} patch(es).`);
  }
  return soleIndexNamed(named, trimmed);
};

/**
 * Interprets a field value against the field it is going into: "72" becomes the number 72 and
 * "true" becomes a boolean, but only where `existing` shows the field is not itself a string. A
 * command line can express a number no other way, so the coercion has to happen somewhere; doing it
 * blind turned a patch named "1984" into the number 1984, which the name encoder then could not pad
 * to the block's width. A value that arrives already typed is taken as it is.
 */
const coerceValue = (value: FieldValue, existing: unknown): FieldValue => {
  if (typeof value !== "string" || typeof existing === "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  const asNumber = Number(value);
  const result = Number.isNaN(asNumber) ? value : asNumber;
  return result;
};

/**
 * Names what is actually available at the level a dot-path went wrong, so a caller who guessed a
 * field name is told the real ones rather than left to guess again.
 */
const unknownPathError = (
  dottedPath: string,
  segment: string,
  available: Record<string, unknown>,
): Error => {
  const valid = Object.keys(available).sort().join(", ");
  return new Error(
    `Unknown field path "${dottedPath}": "${segment}" is not a field here. Valid fields at this level: ${valid}`
  );
};

/** Where a dot-path ends up: the record its last segment lives in, and that segment. */
interface Field {
  holder: Record<string, unknown>;
  key: string;
}

/**
 * Walks a dot-path to the field it names, so a caller can read what is there before writing over it.
 *
 * Every segment must already exist: a decoded patch carries the complete set of fields its device
 * supports, so a path that isn't there names a field the device doesn't have. Writing it anyway
 * would be silently dropped by the encoder (which only emits known byte indices), leaving the
 * caller believing an edit landed when nothing changed.
 */
const fieldAt = (target: Record<string, unknown>, dottedPath: string): Field => {
  const parts = dottedPath.split(".");
  const key = parts.pop() ?? dottedPath;
  let current = target;
  for (const [depth, part] of parts.entries()) {
    const next = current[part];
    if (next === null || typeof next !== "object") {
      throw unknownPathError(dottedPath, parts.slice(0, depth + 1).join("."), current);
    }
    current = next as Record<string, unknown>;
  }

  if (!(key in current)) throw unknownPathError(dottedPath, key, current);
  return { holder: current, key };
};

/** Sets a nested value by dot-notation path: setByPath(patch, "amp.gain", 72) sets patch.amp.gain. */
const setByPath = (
  target: Record<string, unknown>,
  dottedPath: string,
  value: unknown,
): void => {
  const { holder, key } = fieldAt(target, dottedPath);
  holder[key] = value;
};

/** A patch and the slot it sits in, which is what a surface reports an edit or a copy against. */
interface SelectedPatch<T extends Patch> {
  index: number;
  patch: T;
}

/**
 * The patch a ref names, together with its index. Resolving and reading are one step because they
 * are one question: `resolvePatchIndex` has already bounded the index against this same array, and
 * splitting them leaves every caller to re-establish that for itself.
 */
const resolvePatch = <T extends Patch>(patches: T[], ref: string): SelectedPatch<T> => {
  const index = resolvePatchIndex(patches, ref);
  const patch = patches[index];
  if (patch === undefined) {
    throw new Error(`No patch at index ${index}: the file holds ${patches.length} patch(es).`);
  }
  return { index, patch };
};

/** A single patch when `ref` is given, every patch in file order when it is omitted. */
const resolvePatches = <T extends Patch>(patches: T[], ref?: string): SelectedPatch<T>[] =>
  ref !== undefined
    ? [resolvePatch(patches, ref)]
    : patches.map((patch, index) => ({ index, patch }));

/**
 * Applies dot-path edits to a patch in place, then checks the result against the device's catalog
 * and throws with every problem at once. Returns what actually landed, keyed by path, so a caller
 * can report the written values without re-deriving the coercion each one went through.
 *
 * The edits land before the check because a block's type is one of the things an edit can set, and
 * the driver reads each block's type off the patch. Nothing is written to disk on a rejection: the
 * caller throws before its `writeFile`, so the patch that was mutated is the one being discarded.
 */
const applyFieldEdits = <T extends Patch>(
  driver: PatchDriver<T>,
  patch: T,
  edits: readonly (readonly [path: string, rawValue: FieldValue])[],
): FieldEdits => {
  const applied: FieldEdits = {};
  for (const [path, rawValue] of edits) {
    const { holder, key } = fieldAt(patch as unknown as Record<string, unknown>, path);
    const value = coerceValue(rawValue, holder[key]);
    holder[key] = value;
    applied[path] = value;
  }

  const issues = driver.validateFields(patch, applied);
  if (issues.length > 0) throw new Error(issues.join("\n"));
  return applied;
};

/** Reads `path`, or starts a fresh empty file named `setName` when it doesn't exist yet. */
const readExistingOrNew = <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  setName: string,
): { file: PatchFile<T>; created: boolean } => {
  try {
    return { file: driver.readFile(path), created: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { file: driver.newFile(setName, 0), created: true };
  }
};

/** What to save and where. `setName` names the patch set itself, not the file. */
interface UpsertRequest<T extends Patch> {
  path: string;
  patches: T[];
  setName?: string;
}

/** What one saved patch became: it took the place of a same-named patch, or joined the set. */
interface SavedPatch {
  name: string;
  action: "replaced" | "appended";
}

/**
 * What a save did, so a caller can say so without reading the file back. A second read costs a
 * decode of every patch in the set and undoes the read-once, write-once property below.
 */
interface UpsertReport<T extends Patch> {
  file: PatchFile<T>;
  /** True when `path` held no file and this save started one. */
  created: boolean;
  saved: SavedPatch[];
}

/**
 * Refuses a batch that names the same patch twice. The save keys on the name, so the second would
 * replace the first and the report would claim two patches landed where the file holds one.
 */
const requireDistinctNames = (patches: Patch[]): void => {
  const seen = new Map<string, number>();
  for (const [index, patch] of patches.entries()) {
    const first = seen.get(patch.name);
    if (first !== undefined) {
      throw new Error(
        `Duplicate patch name "${patch.name}" at patches[${first}] and patches[${index}]: ` +
        "a save keys on the name, so only the last would survive. Give each patch its own name."
      );
    }
    seen.set(patch.name, index);
  }
};

/**
 * Saves every patch into the file at `path`, keyed by name: a patch whose name already exists
 * replaces it, otherwise it is appended, in array order. Creates the file (and, via the driver's
 * writeFile, any missing parent directories) when `path` doesn't exist yet.
 *
 * The file is read once and written once however many patches are saved, so a whole set lands in
 * one write rather than a read/write cycle per patch.
 *
 * A `setName` names a freshly created file and renames an existing one. Omitted, a new file takes
 * the first patch's name and an existing file keeps its own.
 */
const upsertPatches = <T extends Patch>(driver: PatchDriver<T>, request: UpsertRequest<T>): UpsertReport<T> => {
  const { path, patches, setName } = request;
  const [first] = patches;
  if (first === undefined) throw new Error("No patches to save: `patches` must hold at least one patch.");
  requireDistinctNames(patches);

  const { file, created } = readExistingOrNew(driver, path, setName ?? first.name);
  if (setName !== undefined) file.name = setName;

  const saved = patches.map((patch): SavedPatch => {
    const index = file.patches.findIndex(existing => existing.name === patch.name);
    if (index >= 0) {
      file.patches[index] = patch;
      return { name: patch.name, action: "replaced" };
    }
    file.patches.push(patch);
    return { name: patch.name, action: "appended" };
  });

  driver.writeFile(file, path);
  return { file, created, saved };
};

/** Which patch a copy moved, and where, so each surface can word its own confirmation. */
interface CopiedPatch {
  name: string;
  fromIndex: number;
  toIndex: number;
}

/** The two ends of a copy. `src` and `dst` may name the same file. */
interface CopyRequest {
  src: string;
  srcRef: string;
  dst: string;
  dstRef: string;
}

/**
 * Copies one patch between patch files, replacing the patch at `dstRef` rather than appending
 * (that is `upsertPatches`). Both paths are read separately, so a copy within one file takes its
 * source from an independent decode instead of from the object it is about to overwrite.
 */
const copyPatch = <T extends Patch>(driver: PatchDriver<T>, request: CopyRequest): CopiedPatch => {
  const srcFile = driver.readFile(request.src);
  const dstFile = driver.readFile(request.dst);
  const { index: fromIndex, patch } = resolvePatch(srcFile.patches, request.srcRef);
  const toIndex = resolvePatchIndex(dstFile.patches, request.dstRef);

  dstFile.patches[toIndex] = patch;
  driver.writeFile(dstFile, request.dst);
  return { name: patch.name, fromIndex, toIndex };
};

/** How to start a fresh patch file: what to call the set, and how many blank patches it opens with. */
interface NewFileOptions {
  setName?: string;
  patchCount?: number;
}

const DEFAULT_NEW_PATCH_COUNT = 1;

/**
 * The most blank patches one file can be started with. This is a guard against a mistyped count,
 * not a device's capacity: it sits well above the memory of any device a driver speaks for, and
 * below the point where a surface asking for patches sits and waits on the answer.
 */
const MAX_NEW_PATCHES = 500;

const requireUsableCount = (patchCount: number): void => {
  if (!Number.isInteger(patchCount) || patchCount < 1 || patchCount > MAX_NEW_PATCHES) {
    throw new Error(
      `Cannot start a file with ${patchCount} patches: give a whole number from 1 to ${MAX_NEW_PATCHES}.`
    );
  }
};

/**
 * Creates a patch file at `path` and returns it. Refuses to overwrite an existing file, since the
 * whole point is a blank start and the caller would lose a library to a mistyped path.
 * The set takes the filename when `setName` is omitted.
 */
const createPatchFile = <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  options: NewFileOptions = {},
): PatchFile<T> => {
  requireUsableCount(options.patchCount ?? DEFAULT_NEW_PATCH_COUNT);
  if (existsSync(path)) throw new Error(`${path} already exists, refusing to overwrite it.`);

  const setName = options.setName ?? basename(path, extname(path));
  const file = driver.newFile(setName, options.patchCount ?? DEFAULT_NEW_PATCH_COUNT);
  driver.writeFile(file, path);
  return file;
};

export {
  MAX_NEW_PATCHES,
  resolvePatchIndex,
  coerceValue,
  setByPath,
  resolvePatch,
  resolvePatches,
  applyFieldEdits,
  upsertPatches,
  copyPatch,
  createPatchFile,
};
export type {
  SelectedPatch, UpsertRequest, UpsertReport, SavedPatch, CopiedPatch, CopyRequest, NewFileOptions,
};
