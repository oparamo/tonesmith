import { toSigned, toUnsigned, byteAt, lookupName, shownValue } from "./primitives";
import type { FxParams } from "../types";

// ── Value guards ──────────────────────────────────────────────────────────────

type Bounds = readonly [min: number, max: number];

const BYTE_RANGE: Bounds = [0, 255];
const NIBBLE_QUAD_RANGE: Bounds = [0, 0xFFFF];

/**
 * `hexFromBytes` catches a bad byte too, but knows only its index. Checking here is what lets the
 * message name the param the caller set, and the bounds are stated at the field's own scale rather
 * than the byte's for the same reason.
 */
const numberWithin = (name: string, value: unknown, [min, max]: Bounds): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new RangeError(`${name}: value ${shownValue(value)} is outside ${min} to ${max}`);
  return value;
};

const intWithin = (name: string, value: unknown, bounds: Bounds): number => {
  const within = numberWithin(name, value, bounds);
  if (!Number.isInteger(within)) throw new RangeError(`${name}: value ${within} is not a whole number`);
  return within;
};

// ── FieldCodec interface ───────────────────────────────────────────────────────

/**
 * One named parameter within a binary block. The decode/encode pair are strict inverses:
 * encode(decode(bytes)) restores the original bytes at the mapped offset, the invariant the
 * per-type round-trip tests check.
 *
 * Both methods work on a mutable byte array, so a caller builds a complete encoding by applying
 * a list of codecs in sequence over the original bytes.
 */
interface FieldCodec {
  readonly name: string;
  /** Present on fields built by the constructors below; hand-written FieldCodec
   * object literals may omit it. */
  readonly kind?: "u8" | "signed" | "lookup" | "bool" | "scaled" | "nibblePair" | "nibbleQuad" | "indexTable";
  readonly center?: number;
  readonly table?: readonly (string | number)[];
  decode(bytes: number[]): string | number | boolean;
  encode(value: string | number | boolean, bytes: number[]): void;
}


// ── Field constructors ────────────────────────────────────────────────────────

/** A raw unsigned byte: decoded value is identical to the stored byte. */
const u8 = (name: string, offset: number): FieldCodec => ({
  name,
  kind: "u8",
  decode: bytes => byteAt(bytes, offset, name),
  encode: (value, bytes) => { bytes[offset] = intWithin(name, value, BYTE_RANGE); },
});

/**
 * A signed/biased byte: raw value is stored as (decoded + center).
 * Used for EQ gains (center=50 or 20), pitch offsets (center=24 or 12),
 * and any parameter that is "zero" at a non-zero byte value.
 */
const signed = (name: string, offset: number, center = 50): FieldCodec => ({
  name,
  kind: "signed",
  center,
  decode: bytes => toSigned(byteAt(bytes, offset, name), center),
  encode: (value, bytes) => {
    const decodedRange: Bounds = [-center, 255 - center];
    bytes[offset] = toUnsigned(intWithin(name, value, decodedRange), center);
  },
});

/**
 * A lookup field: the byte is an index into a string table.
 * Decoding an out-of-range index produces an "UNKNOWN_N" sentinel.
 * Encoding an unknown sentinel throws: callers should only write values that were
 * decoded from the same table.
 */
const lookup = (name: string, offset: number, table: readonly string[]): FieldCodec => ({
  name,
  kind: "lookup",
  table,
  decode: bytes => lookupName(table, byteAt(bytes, offset, name)),
  encode: (value, bytes) => {
    const index = table.indexOf(value as string);
    if (index < 0) throw new Error(`Unknown ${name} value: ${JSON.stringify(value)}`);
    bytes[offset] = index;
  },
});


/**
 * A boolean toggle: raw byte 0 = false, any non-zero (canonically 1) = true.
 * Encoding validates the value is a boolean (mirrors `lookup`'s strictness) so a
 * mistyped on/off param fails loudly rather than writing a garbage byte.
 */
const bool = (name: string, offset: number): FieldCodec => ({
  name,
  kind: "bool",
  decode: bytes => byteAt(bytes, offset, name) !== 0,
  encode: (value, bytes) => {
    if (typeof value !== "boolean") throw new Error(`${name}: expected a boolean, got ${JSON.stringify(value)}`);
    bytes[offset] = value ? 1 : 0;
  },
});

/**
 * A scaled byte: raw byte × factor gives the decoded value (rounded to 1 decimal).
 * Used for time values stored as tenths of seconds (factor=0.1).
 */
const scaled = (name: string, offset: number, factor: number): FieldCodec => ({
  name,
  kind: "scaled",
  decode: bytes => Math.round(byteAt(bytes, offset, name) * factor * 10) / 10,
  encode: (value, bytes) => {
    /** A fraction is legal here, which is what the factor is for, so only the stored byte is bounded. */
    const scaledRange: Bounds = [0, 255 * factor];
    bytes[offset] = Math.round(numberWithin(name, value, scaledRange) / factor);
  },
});

/**
 * An 8-bit value split across two consecutive bytes, one hex digit (nibble)
 * per byte, most-significant first. Used for reverb pre-delay (max 200ms).
 */
const nibblePair = (name: string, offset: number): FieldCodec => ({
  name,
  kind: "nibblePair",
  decode: bytes => byteAt(bytes, offset, name) * 16 + byteAt(bytes, offset + 1, name),
  encode: (value, bytes) => {
    const n = intWithin(name, value, BYTE_RANGE);
    bytes[offset]     = (n >> 4) & 0xF;
    bytes[offset + 1] = n & 0xF;
  },
});

/**
 * A 16-bit value split across four consecutive bytes, one hex digit (nibble)
 * per byte, most-significant first. Used for delay/pre-delay times up to ~2000ms.
 */
const nibbleQuad = (name: string, offset: number): FieldCodec => ({
  name,
  kind: "nibbleQuad",
  decode: bytes =>
    byteAt(bytes, offset, name) * 4096 + byteAt(bytes, offset + 1, name) * 256 +
    byteAt(bytes, offset + 2, name) * 16 + byteAt(bytes, offset + 3, name),
  encode: (value, bytes) => {
    const n = intWithin(name, value, NIBBLE_QUAD_RANGE);
    bytes[offset]     = (n >> 12) & 0xF;
    bytes[offset + 1] = (n >> 8) & 0xF;
    bytes[offset + 2] = (n >> 4) & 0xF;
    bytes[offset + 3] = n & 0xF;
  },
});


// ── Generic walkers ───────────────────────────────────────────────────────────

const decodeFields = (fields: FieldCodec[], bytes: number[]): FxParams =>
  Object.fromEntries(fields.map(field => [field.name, field.decode(bytes)]));

/**
 * Writes into a byte array that already holds the original bytes, touching only the positions
 * the field list covers, so unknown fields survive untouched.
 */
const encodeFields = (fields: FieldCodec[], params: FxParams, bytes: number[]): void => {
  for (const field of fields) {
    const value = params[field.name];
    if (value !== undefined) field.encode(value, bytes);
  }
};

export type { FieldCodec };
export { u8, signed, lookup, bool, scaled, nibblePair, nibbleQuad, decodeFields, encodeFields };
