/**
 * What a block schema says when it is handed a key it doesn't declare.
 *
 * zod's default names the keys it threw out and stops there, which leaves the caller to work out
 * whether the key was wrong or only in the wrong place. Both happen, because the blocks are not
 * shaped alike: delay, reverb and pfx carry their type's params as fields, while an fx slot carries
 * its own in a `params` record, so a caller working by analogy from one lands here on the other.
 * Printing the accepted shape answers both cases at once, and printing it per type means the
 * caller reads the fields that type really has rather than a generic outline.
 */
import type { z } from "zod";
import { typeSurface } from "./validate-params";
import type { TypeSurface } from "./validate-params";

const TYPE_FIELD = "type";
const SUB_TYPE_FIELD = "subType";
const PARAMS_FIELD = "params";

/** The block a rejected input was addressing, as far as the input itself reveals. */
interface BlockContext {
  group: string;
  /** The chosen type, absent when the caller omitted it or sent something that isn't a string. */
  type?: string;
  /** What that type accepts, absent when nothing resolved it. */
  surface?: TypeSurface;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

/**
 * Reads the block's own selection back off the input being rejected. This runs on input that
 * already failed validation, so every field is treated as untrusted: an unresolvable type just
 * yields no param keys, and the message falls back to listing fields.
 */
const blockContext = (group: string, input: unknown): BlockContext => {
  const block = asRecord(input);
  const type = typeof block[TYPE_FIELD] === "string" ? block[TYPE_FIELD] : undefined;
  return { group, type, surface: typeSurface({ group, type, subType: block[SUB_TYPE_FIELD] }) };
};

const quoted = (keys: string[]): string => keys.map(key => `"${key}"`).join(", ");

/** One field of the skeleton, filled in where the block's own selection makes it concrete. */
const fieldText = (name: string, block: BlockContext): string => {
  if (name === TYPE_FIELD && block.type !== undefined) return `${TYPE_FIELD}: "${block.type}"`;
  const paramKeys = block.surface?.paramKeys ?? [];
  if (name === PARAMS_FIELD && paramKeys.length > 0) return `${PARAMS_FIELD}: { ${paramKeys.join(", ")} }`;
  return name;
};

/**
 * A field the chosen type can't use is left out. An fx slot declares one `subType` field on behalf
 * of all 39 of its effects, so offering it at an effect with no variants sends the caller straight
 * into a second rejection.
 */
const usableFields = (fields: string[], block: BlockContext): string[] => {
  if (block.surface === undefined || block.surface.subTypes.length > 0) return fields;
  return fields.filter(name => name !== SUB_TYPE_FIELD);
};

/**
 * The shape this block accepts, printed rather than described. Nesting is exactly what a prose
 * list of field names loses, and nesting is what the caller got wrong.
 */
const shapeSkeleton = (fields: string[], block: BlockContext): string => {
  const label = block.type === undefined ? block.group : `${block.group} ${block.type}`;
  const body = usableFields(fields, block).map(name => fieldText(name, block)).join(", ");
  return `${label} takes: { ${body} }`;
};

/** Keys that name a real param of the chosen type, sent one level too high. */
const misplacedLine = (keys: string[], block: BlockContext): string => {
  const noun = keys.length === 1 ? "is a param" : "are params";
  const place = keys.length === 1 ? "not a field on the block" : "not fields on the block";
  return `${quoted(keys)} ${noun} of ${block.group} ${block.type}, ${place}.`;
};

/** Keys the chosen type has no param for either. */
const unknownLine = (keys: string[]): string => {
  const noun = keys.length === 1 ? "No field" : "No fields";
  return `${noun} ${quoted(keys)} on this block.`;
};

/**
 * The error map a block schema attaches for keys it doesn't declare. `fields` is the schema's own
 * key list, so the message can't drift from what the schema accepts, and a key counts as misplaced
 * only where the block has a `params` record to have misplaced it from.
 */
const unrecognizedKeyError = (group: string, fields: string[]): z.core.$ZodErrorMap => issue => {
  if (issue.code !== "unrecognized_keys") return undefined;

  const block = blockContext(group, issue.input);
  const paramKeys = block.surface?.paramKeys ?? [];
  const misplaced = fields.includes(PARAMS_FIELD) ? issue.keys.filter(key => paramKeys.includes(key)) : [];
  const unknown = issue.keys.filter(key => !misplaced.includes(key));

  const misplacedText = misplaced.length > 0 ? [misplacedLine(misplaced, block)] : [];
  const unknownText = unknown.length > 0 ? [unknownLine(unknown)] : [];
  return [...misplacedText, ...unknownText, shapeSkeleton(fields, block)].join("\n");
};

export { unrecognizedKeyError, TYPE_FIELD, SUB_TYPE_FIELD };
