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
 * Set a nested value on an object using a dot-notation path.
 * Example: setByPath(patch, "amp.gain", 72) sets patch.amp.gain = 72.
 * Intermediate segments must already exist as objects.
 */
const setByPath = (
  target: Record<string, unknown>,
  dottedPath: string,
  value: unknown,
): void => {
  const parts = dottedPath.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) {
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
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
 * Mutates the patch in place. Shared by the CLI `write` command and the MCP `write_field`
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
 * Saves `patch` into the patch file at `path`, keyed by name: replaces the existing
 * patch of the same name if one is found, otherwise appends. Creates the file (and,
 * via the driver's writeFile, any missing parent directories) if `path` doesn't exist
 * yet. Device-agnostic — works for any PatchDriver, not just gx1.
 */
const upsertPatch = <T extends Patch>(driver: PatchDriver<T>, path: string, patch: T): PatchFile<T> => {
  const file = readExistingOrNew(driver, path, patch.name);
  const index = file.patches.findIndex(existing => existing.name === patch.name);
  if (index >= 0) file.patches[index] = patch;
  else file.patches.push(patch);
  driver.writeFile(file, path);
  return file;
};

export { resolvePatchIndex, coerceValue, setByPath, resolvePatchIndices, applyFieldEdits, upsertPatch };
