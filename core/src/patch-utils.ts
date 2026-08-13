import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import type { FieldEdits, Patch, PatchFile, PatchDriver } from "./types";

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
  if (matches.length === 0) throw new Error(`No patch named "${ref}"`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous name "${ref}": matches indices ${matches.join(", ")}`);
  }
  return matches[0];
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

/** Interprets a CLI/MCP field value: "72" becomes the number 72, "true"/"false" become booleans. */
const coerceValue = (value: string): string | number | boolean => {
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

/**
 * Sets a nested value by dot-notation path: setByPath(patch, "amp.gain", 72) sets patch.amp.gain.
 *
 * Every segment must already exist: a decoded patch carries the complete set of fields its device
 * supports, so a path that isn't there names a field the device doesn't have. Writing it anyway
 * would be silently dropped by the encoder (which only emits known byte indices), leaving the
 * caller believing an edit landed when nothing changed.
 */
const setByPath = (
  target: Record<string, unknown>,
  dottedPath: string,
  value: unknown,
): void => {
  const parts = dottedPath.split(".");
  let current = target;
  for (const [depth, part] of parts.slice(0, -1).entries()) {
    const next = current[part];
    if (next === null || typeof next !== "object") {
      throw unknownPathError(dottedPath, parts.slice(0, depth + 1).join("."), current);
    }
    current = next as Record<string, unknown>;
  }

  const leaf = parts[parts.length - 1];
  if (!(leaf in current)) throw unknownPathError(dottedPath, leaf, current);
  current[leaf] = value;
};

/** A single index when `ref` is given, every index in file order when it is omitted. */
const resolvePatchIndices = (patches: Patch[], ref?: string): number[] =>
  ref !== undefined
    ? [resolvePatchIndex(patches, ref)]
    : patches.map((_, index) => index);

/**
 * Applies dot-path edits to a patch in place, coercing each raw string value, then checks the
 * result against the device's catalog and throws with every problem at once.
 *
 * The edits land before the check because a block's type is one of the things an edit can set, and
 * the driver reads each block's type off the patch. Nothing is written to disk on a rejection: the
 * caller throws before its `writeFile`, so the patch that was mutated is the one being discarded.
 */
const applyFieldEdits = <T extends Patch>(
  driver: PatchDriver<T>,
  patch: T,
  edits: readonly (readonly [path: string, rawValue: string])[],
): void => {
  const applied: FieldEdits = {};
  for (const [path, rawValue] of edits) {
    const value = coerceValue(rawValue);
    setByPath(patch as unknown as Record<string, unknown>, path, value);
    applied[path] = value;
  }

  const issues = driver.validateFields(patch, applied);
  if (issues.length > 0) throw new Error(issues.join("\n"));
};

/** Reads `path`, or starts a fresh empty file named `setName` when it doesn't exist yet. */
const readExistingOrNew = <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  setName: string,
): PatchFile<T> => {
  try {
    return driver.readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return driver.newFile(setName, 0);
    throw error;
  }
};

/** What to save and where. `setName` names the patch set itself, not the file. */
interface UpsertRequest<T extends Patch> {
  path: string;
  patches: T[];
  setName?: string;
}

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
const upsertPatches = <T extends Patch>(driver: PatchDriver<T>, request: UpsertRequest<T>): PatchFile<T> => {
  const { path, patches, setName } = request;
  if (patches.length === 0) throw new Error("No patches to save: `patches` must hold at least one patch.");

  const file = readExistingOrNew(driver, path, setName ?? patches[0].name);
  if (setName !== undefined) file.name = setName;

  for (const patch of patches) {
    const index = file.patches.findIndex(existing => existing.name === patch.name);
    if (index >= 0) file.patches[index] = patch;
    else file.patches.push(patch);
  }

  driver.writeFile(file, path);
  return file;
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
  const fromIndex = resolvePatchIndex(srcFile.patches, request.srcRef);
  const toIndex = resolvePatchIndex(dstFile.patches, request.dstRef);
  const patch = srcFile.patches[fromIndex];

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
 * Creates a patch file at `path` and returns it. Refuses to overwrite an existing file, since the
 * whole point is a blank start and the caller would lose a library to a mistyped path.
 * The set takes the filename when `setName` is omitted.
 */
const createPatchFile = <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  options: NewFileOptions = {},
): PatchFile<T> => {
  if (existsSync(path)) throw new Error(`${path} already exists, refusing to overwrite it.`);

  const setName = options.setName ?? basename(path, extname(path));
  const file = driver.newFile(setName, options.patchCount ?? DEFAULT_NEW_PATCH_COUNT);
  driver.writeFile(file, path);
  return file;
};

export {
  resolvePatchIndex,
  coerceValue,
  setByPath,
  resolvePatchIndices,
  applyFieldEdits,
  upsertPatches,
  copyPatch,
  createPatchFile,
};
export type { UpsertRequest, CopiedPatch, CopyRequest, NewFileOptions };
