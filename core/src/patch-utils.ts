import { access, readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { writeFileAtomic } from "./atomic-write";
import { withFileLock } from "./file-lock";
import type { FieldEdit, FieldEdits, Patch, PatchFile, PatchDriver } from "./types";

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
 * enough to be dangerous: it reads `""` as 0, so a ref a caller leaves out selects the first patch
 * and, on a write, overwrites it, and it rounds `"0x1"` and `"2.0"` into indices the caller never
 * spelled out.
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
 * Reads and decodes the patch file at `path`. Needs no lock: every write lands by rename, so a read
 * sees a whole file, old or new, never one partway written.
 */
const readPatchFile = async <T extends Patch>(driver: PatchDriver<T>, path: string): Promise<PatchFile<T>> => {
  const bytes = await readFile(path);
  return driver.parseFile(bytes, path);
};

/** Only core writes a patch file, and only from inside a locked operation, so no write can race. */
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

/** Reads `path`, or starts a fresh empty file named `setName` when it doesn't exist yet. */
const readExistingOrNew = async <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  setName: string,
): Promise<{ file: PatchFile<T>; created: boolean }> => {
  try {
    return { file: await readPatchFile(driver, path), created: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { file: driver.newFile(setName, 0), created: true };
  }
};

/** Where to save, and what to name the patch set: a fresh file takes it, an existing one is renamed. */
interface UpsertTarget {
  path: string;
  setName?: string;
}

/**
 * Patches already decoded or built, saved as they are. A decoded patch has to come this way rather
 * than as a spec: rebuilding it from its fields would drop the bytes its codec doesn't know.
 */
interface SavePatches<T extends Patch> extends UpsertTarget {
  patches: readonly T[];
  specs?: never;
}

/** Plain spec objects, built through `driver.buildPatch` before anything is read or written. */
interface SaveSpecs extends UpsertTarget {
  specs: readonly unknown[];
  patches?: never;
}

/** Exactly one of `patches` or `specs`: the `never` side makes passing both, or neither, a type error. */
type UpsertRequest<T extends Patch> = SavePatches<T> | SaveSpecs;

/** What one saved patch became: it took the place of a same-named patch, or joined the set. */
interface SavedPatch<T extends Patch> {
  name: string;
  action: "replaced" | "appended";
  /** The patch as saved, so a caller can show it without reading the file back. */
  patch: T;
}

/**
 * What a save did, so a caller can say so without reading the file back. A second read costs a
 * decode of every patch in the set and undoes the read-once, write-once property below.
 */
interface UpsertReport<T extends Patch> {
  file: PatchFile<T>;
  /** True when `path` held no file and this save started one. */
  created: boolean;
  saved: SavedPatch<T>[];
}

/** The `name` a spec gives itself, when it gives one, to tell a failing spec apart from its batch. */
const specNameTag = (spec: unknown): string => {
  const name = (spec as { name?: unknown } | null)?.name;
  const tag = typeof name === "string" ? ` ("${name}")` : "";
  return tag;
};

/**
 * Builds every spec, naming which one failed. The same block usually appears in every spec of a
 * batch, so the driver's own message, which names only the block, leaves the caller guessing which
 * patch it came from.
 */
const buildEach = <T extends Patch>(driver: PatchDriver<T>, specs: readonly unknown[]): T[] =>
  specs.map((spec, position) => {
    try {
      return driver.buildPatch(spec);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Patch spec at position ${position}${specNameTag(spec)}: ${reason}`);
    }
  });

/**
 * Refuses a batch that names the same patch twice. The save keys on the name, so the second would
 * replace the first and the report would claim two patches landed where the file holds one.
 */
const requireDistinctNames = (patches: readonly Patch[]): void => {
  const seen = new Map<string, number>();
  for (const [position, patch] of patches.entries()) {
    const first = seen.get(patch.name);
    if (first !== undefined) {
      throw new Error(
        `Duplicate patch name "${patch.name}" at positions ${first} and ${position}: ` +
        "a save keys on the name, so only the last would survive. Give each patch its own name."
      );
    }
    seen.set(patch.name, position);
  }
};

/**
 * Saves every patch into the file at `path`, keyed by name: a patch whose name already exists
 * replaces it, otherwise it is appended, in array order. Creates the file and any missing parent
 * directories when `path` doesn't exist yet. Specs are built first, so one that fails leaves the
 * file as it was.
 *
 * The file is read once and written once however many patches are saved, so a whole set lands in
 * one write rather than a read/write cycle per patch.
 *
 * A `setName` names a freshly created file and renames an existing one. Omitted, a new file takes
 * the first patch's name and an existing file keeps its own.
 */
const upsertPatches = async <T extends Patch>(
  driver: PatchDriver<T>,
  request: UpsertRequest<T>,
): Promise<UpsertReport<T>> => {
  const { path, setName } = request;
  const patches = request.specs === undefined ? request.patches : buildEach(driver, request.specs);
  const [first] = patches;
  if (first === undefined) throw new Error("No patches to save: give at least one.");
  requireDistinctNames(patches);

  // Not updatePatchFile: a missing file is a start here rather than an error, and the lock has to
  // cover that decision too, or two first saves to one path would each start a file of their own.
  return withFileLock(path, async () => {
    const { file, created } = await readExistingOrNew(driver, path, setName ?? first.name);
    if (setName !== undefined) file.name = setName;

    const saved = patches.map((patch): SavedPatch<T> => {
      const index = file.patches.findIndex(existing => existing.name === patch.name);
      if (index >= 0) {
        file.patches[index] = patch;
        return { name: patch.name, action: "replaced", patch };
      }
      file.patches.push(patch);
      return { name: patch.name, action: "appended", patch };
    });

    await writePatchFile(driver, file, path);
    return { file, created, saved };
  });
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
const copyPatch = async <T extends Patch>(driver: PatchDriver<T>, request: CopyRequest): Promise<CopiedPatch> => {
  const srcFile = await readPatchFile(driver, request.src);
  const { index: fromIndex, patch } = resolvePatch(srcFile.patches, request.srcRef);

  return updatePatchFile(driver, request.dst, dstFile => {
    const toIndex = resolvePatchIndex(dstFile.patches, request.dstRef);
    dstFile.patches[toIndex] = patch;
    return { name: patch.name, fromIndex, toIndex };
  });
};

/** Which patch to edit and how, and whether to rename the set. At least one of the two is asked for. */
interface PatchFileEdit {
  ref?: string;
  fields?: readonly FieldEdit[];
  setName?: string;
}

/** What an edit did: the patch it landed on and the values written there, and the new set name. */
interface PatchFileEditReport {
  index?: number;
  applied?: FieldEdits;
  setName?: string;
}

/** Rejects an edit that asks for no change at all, or for a patch edit without naming the patch. */
const requireSomethingToChange = (request: PatchFileEdit): void => {
  if (request.fields === undefined && request.setName === undefined) {
    throw new Error(
      "Nothing to change: pass `fields` (with `ref`) to edit a patch, `setName` to rename the " +
        "patch set, or both."
    );
  }
  if (request.fields !== undefined && request.ref === undefined) {
    throw new Error("`ref` is required alongside `fields`, since it selects which patch to edit.");
  }
};

/**
 * Applies dot-path edits to one patch and/or renames the patch set, in one write. Every edit lands
 * in memory before anything is written, so a rejected edit anywhere in the batch leaves the file
 * exactly as it was. The report carries what the driver wrote rather than what was asked for.
 */
const editPatchFile = async <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  request: PatchFileEdit,
): Promise<PatchFileEditReport> => {
  requireSomethingToChange(request);
  const { ref, fields, setName } = request;

  return updatePatchFile(driver, path, file => {
    const report: PatchFileEditReport = {};
    if (fields !== undefined && ref !== undefined) {
      const { index, patch } = resolvePatch(file.patches, ref);
      report.index = index;
      report.applied = driver.applyEdits(patch, fields);
    }
    if (setName !== undefined) {
      file.name = setName;
      report.setName = setName;
    }
    return report;
  });
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

/**
 * Whether `path` is free to create. Only a missing file counts as free: a permission error says
 * nothing about what sits there, so it is rethrown rather than read as room to write.
 */
const isPathFree = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return true;
  }
};

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
const createPatchFile = async <T extends Patch>(
  driver: PatchDriver<T>,
  path: string,
  options: NewFileOptions = {},
): Promise<PatchFile<T>> => {
  requireUsableCount(options.patchCount ?? DEFAULT_NEW_PATCH_COUNT);
  const setName = options.setName ?? basename(path, extname(path));

  // The check and the write share one lock, or two creates on one path could both find it free.
  return withFileLock(path, async () => {
    const pathFree = await isPathFree(path);
    if (!pathFree) throw new Error(`${path} already exists, refusing to overwrite it.`);

    const file = driver.newFile(setName, options.patchCount ?? DEFAULT_NEW_PATCH_COUNT);
    await writePatchFile(driver, file, path);
    return file;
  });
};

export {
  MAX_NEW_PATCHES,
  resolvePatchIndex,
  resolvePatch,
  resolvePatches,
  readPatchFile,
  editPatchFile,
  upsertPatches,
  copyPatch,
  createPatchFile,
};
export type {
  SelectedPatch, UpsertRequest, SavePatches, SaveSpecs, UpsertReport, SavedPatch, CopiedPatch,
  CopyRequest, NewFileOptions,
  PatchFileEdit, PatchFileEditReport,
};
