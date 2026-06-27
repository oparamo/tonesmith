import type { Patch } from "./types";

/**
 * Resolve a patch reference (numeric index string or exact name) to an array index.
 * Throws with a descriptive message when the ref is ambiguous or not found.
 */
const resolvePatchIndex = <T extends Patch>(patches: T[], ref: string): number => {
  const asNumber = Number(ref);
  if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) return asNumber;

  const needle = ref.toLowerCase();
  const matches = patches.flatMap((patch, index) =>
    patch.name.trim().toLowerCase() === needle ? [index] : []
  );

  if (matches.length === 0) throw new Error(`No patch named ${JSON.stringify(ref)}`);
  if (matches.length > 1) {
    throw new Error(`Ambiguous name ${JSON.stringify(ref)} — matches indices ${matches.join(", ")}`);
  }
  return matches[0]!;
};

/**
 * Coerce a string to a number if it parses as one, otherwise return it as-is.
 * Used to interpret CLI/MCP field values like "72" as the number 72.
 */
const coerceValue = (value: string): string | number => {
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? value : asNumber;
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
  current[parts[parts.length - 1]!] = value;
};

export { resolvePatchIndex, coerceValue, setByPath };
