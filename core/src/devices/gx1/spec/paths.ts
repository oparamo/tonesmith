/**
 * Where a dot-path lands on a decoded patch, and what a value means once it gets there.
 *
 * A path is read against the patch itself rather than against the catalog, because the decoded
 * patch carries every field the device supports and nothing else: a segment that isn't there names
 * a control the GX-1 doesn't have. Accepting such a write would strand it, since the encoder emits
 * only byte indices it knows, leaving the caller believing an edit landed while the file kept its
 * old value.
 */
import { NOTE_VALUES } from "../common";
import type { FieldValue } from "../../../types";

/** Where a dot-path ends up: the record its last segment lives in, and that segment. */
interface Field {
  holder: Record<string, unknown>;
  key: string;
}

/**
 * Names what is actually available at the level a path went wrong, so a caller who guessed a field
 * name is told the real ones rather than left to guess again.
 */
const unknownPathIssue = (
  dottedPath: string,
  segment: string,
  available: Record<string, unknown>,
): string => {
  const valid = Object.keys(available).sort().join(", ");
  return `Unknown field path "${dottedPath}": "${segment}" is not a field here. ` +
    `Valid fields at this level: ${valid}`;
};

/** The field a path names, or the reason it names none. */
type Resolution = { field: Field } | { issue: string };

const fieldAt = (target: Record<string, unknown>, dottedPath: string): Resolution => {
  const parts = dottedPath.split(".");
  const key = parts.pop() ?? dottedPath;
  let current = target;
  for (const [depth, part] of parts.entries()) {
    const next = current[part];
    if (next === null || typeof next !== "object") {
      return { issue: unknownPathIssue(dottedPath, parts.slice(0, depth + 1).join("."), current) };
    }
    current = next as Record<string, unknown>;
  }

  if (!(key in current)) return { issue: unknownPathIssue(dottedPath, key, current) };
  return { field: { holder: current, key } };
};

/**
 * Whether the field's current value shows it to be one that holds text. A tempo-synced control
 * holds a note value where it otherwise holds a number, so a string found in one is no evidence of
 * that: without the exception, a control synced to a note could never be set back to a number.
 */
const holdsText = (existing: unknown): boolean =>
  typeof existing === "string" && !NOTE_VALUES.has(existing);

/**
 * Interprets a value against the field it is going into: "72" becomes the number 72 and "true"
 * becomes a boolean, but only where `existing` shows the field is not itself a string. A command
 * line can express a number no other way, so the coercion has to happen somewhere; doing it blind
 * turns a patch named "1984" into the number 1984, which the name encoder cannot pad to the block's
 * width. A value that arrives already typed is taken as it is.
 */
const coerceValue = (value: FieldValue, existing: unknown): FieldValue => {
  if (typeof value !== "string" || holdsText(existing)) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  const asNumber = Number(value);
  const result = Number.isNaN(asNumber) ? value : asNumber;
  return result;
};

export { coerceValue, fieldAt };
export type { Field, Resolution };
