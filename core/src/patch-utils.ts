import type { Patch, PatchFile, PatchDriver } from "./types";

/**
 * Resolve a patch reference (numeric index string or exact name) to an array index.
 * Throws with a descriptive message when the ref is ambiguous or not found.
 */
const resolvePatchIndex = (patches: Patch[], ref: string): number => {
  const asNumber = Number(ref);
  if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) return asNumber;

  const needle = ref.toLowerCase();
  const matches = patches.flatMap((patch, index) =>
    patch.name.trim().toLowerCase() === needle ? [index] : []
  );

  if (matches.length === 0) throw new Error(`No patch named "${ref}"`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous name "${ref}" — matches indices ${matches.join(", ")}`);
  }
  return matches[0];
};

/**
 * Coerce a string to a number or boolean if it parses as one, otherwise return it as-is.
 * Used to interpret CLI/MCP field values like "72" as the number 72, or "true"/"false" as booleans.
 */
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
    `Unknown field path "${dottedPath}" — "${segment}" is not a field here. Valid fields at this level: ${valid}`
  );
};

/**
 * Set a nested value on an object using a dot-notation path.
 * Example: setByPath(patch, "amp.gain", 72) sets patch.amp.gain = 72.
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

/**
 * Resolve a patch reference to the indices it selects: a single index when ref is given,
 * or every index in file order when ref is omitted. Shared by "read one or all patches"
 * commands/tools.
 */
const resolvePatchIndices = (patches: Patch[], ref?: string): number[] =>
  ref !== undefined
    ? [resolvePatchIndex(patches, ref)]
    : patches.map((_, index) => index);

/**
 * Apply a batch of dot-path field edits to a patch, coercing each raw string value.
 * Mutates the patch in place. Shared by the CLI `write` command and the MCP `write_fields`
 * tool so both funnel through one mutation pipeline instead of duplicating it.
 */
const applyFieldEdits = (
  patch: Record<string, unknown>,
  edits: readonly (readonly [path: string, rawValue: string])[],
): void => {
  for (const [path, rawValue] of edits) {
    setByPath(patch, path, coerceValue(rawValue));
  }
};

/** Reads `path` via the driver, or starts a fresh empty file (named after the patch) if it doesn't exist yet. */
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

/**
 * Saves every patch in `patches` into the patch file at `path`, keyed by name: a patch whose name
 * already exists replaces it, otherwise it is appended — applied in array order, so the caller's
 * ordering is what lands on disk. Creates the file (and, via the driver's writeFile, any missing
 * parent directories) if `path` doesn't exist yet. Device-agnostic — works for any PatchDriver.
 *
 * The file is read once and written once however many patches are saved: writing a whole set is a
 * single atomic write rather than one read/write cycle per patch.
 *
 * `setName` names the patch set/library itself: when provided it names a freshly created file and
 * renames an existing one; when omitted a new file is named after the first patch, and an existing
 * file keeps its current name.
 */
const upsertPatches = <T extends Patch>(driver: PatchDriver<T>, path: string, patches: T[], setName?: string): PatchFile<T> => {
  if (patches.length === 0) throw new Error("No patches to save — `patches` must hold at least one patch.");

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

/** Single-patch {@link upsertPatches} — same name-keyed replace-or-append behavior for one patch. */
const upsertPatch = <T extends Patch>(driver: PatchDriver<T>, path: string, patch: T, setName?: string): PatchFile<T> =>
  upsertPatches(driver, path, [patch], setName);

export { resolvePatchIndex, coerceValue, setByPath, resolvePatchIndices, applyFieldEdits, upsertPatch, upsertPatches };
