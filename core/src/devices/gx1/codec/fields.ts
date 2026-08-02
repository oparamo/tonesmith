import { toSigned, toUnsigned, lookupName } from "./primitives";
import type { FxParams } from "../types";

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
  decode(bytes: number[]): string | number | boolean | number[];
  encode(value: string | number | boolean | number[], bytes: number[]): void;
}


// ── Field constructors ────────────────────────────────────────────────────────

/** A raw unsigned byte: decoded value is identical to the stored byte. */
const u8 = (name: string, offset: number): FieldCodec => ({
  name,
  kind: "u8",
  decode: bytes => bytes[offset],
  encode: (value, bytes) => {
    const n = value as number;
    if (n < 0 || n > 255) throw new RangeError(`${name}: value ${n} out of u8 range (0–255)`);
    bytes[offset] = n;
  },
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
  decode: bytes => toSigned(bytes[offset], center),
  encode: (value, bytes) => { bytes[offset] = toUnsigned(value as number, center); },
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
  decode: bytes => lookupName(table, bytes[offset]),
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
  decode: bytes => bytes[offset] !== 0,
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
  decode: bytes => Math.round(bytes[offset] * factor * 10) / 10,
  encode: (value, bytes) => { bytes[offset] = Math.round((value as number) / factor); },
});

/**
 * An 8-bit value split across two consecutive bytes, one hex digit (nibble)
 * per byte, most-significant first. Used for reverb pre-delay (max 200ms).
 */
const nibblePair = (name: string, offset: number): FieldCodec => ({
  name,
  kind: "nibblePair",
  decode: bytes => bytes[offset] * 16 + bytes[offset + 1],
  encode: (value, bytes) => {
    const n = value as number;
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
    bytes[offset] * 4096 + bytes[offset + 1] * 256 + bytes[offset + 2] * 16 + bytes[offset + 3],
  encode: (value, bytes) => {
    const n = value as number;
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
    if (field.name in params) field.encode(params[field.name], bytes);
  }
};

export type { FieldCodec };
export { u8, signed, lookup, bool, scaled, nibblePair, nibbleQuad, decodeFields, encodeFields };
