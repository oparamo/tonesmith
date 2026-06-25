import { toSigned, toUnsigned, lookupName } from "./primitives";
import type { FxParams } from "../types/index";

// ── FieldCodec interface ───────────────────────────────────────────────────────

/**
 * A FieldCodec describes one named parameter within a binary block.
 * The decode/encode pair are strict inverses: encode(decode(bytes)) restores the
 * original bytes at the mapped offset, which is the invariant checked by the
 * per-type round-trip tests.
 *
 * Both methods operate on a mutable byte array so callers can build up a complete
 * encoding by applying a list of codecs in sequence. The byte array is assumed to
 * have been pre-populated with the original (unknown-field-preserving) bytes before
 * any encodeFields call.
 */
interface FieldCodec {
  readonly name: string;
  decode(bytes: number[]): string | number | number[];
  encode(value: string | number | number[], bytes: number[]): void;
}


// ── Field constructors ────────────────────────────────────────────────────────

/** A raw unsigned byte: decoded value is identical to the stored byte. */
const u8 = (name: string, offset: number): FieldCodec => ({
  name,
  decode: bytes => bytes[offset]!,
  encode: (value, bytes) => { bytes[offset] = value as number; },
});

/**
 * A signed/biased byte: raw value is stored as (decoded + centre).
 * Used for EQ gains (centre=50 or 20), pitch offsets (centre=24 or 12),
 * and any parameter that is "zero" at a non-zero byte value.
 */
const signed = (name: string, offset: number, centre = 50): FieldCodec => ({
  name,
  decode: bytes => toSigned(bytes[offset]!, centre),
  encode: (value, bytes) => { bytes[offset] = toUnsigned(value as number, centre); },
});

/**
 * A lookup field: the byte is an index into a string table.
 * Decoding an out-of-range index produces an "UNKNOWN_N" sentinel.
 * Encoding an unknown sentinel throws — callers should only write values that
 * were decoded from the same table.
 */
const lookup = (name: string, offset: number, table: readonly string[]): FieldCodec => ({
  name,
  decode: bytes => lookupName(table, bytes[offset]!),
  encode: (value, bytes) => {
    const index = table.indexOf(value as string);
    if (index < 0) throw new Error(`Unknown ${name} value: ${JSON.stringify(value)}`);
    bytes[offset] = index;
  },
});


/**
 * A scaled byte: raw byte × factor gives the decoded value (rounded to 1 decimal).
 * Used for time values stored as tenths of seconds (factor=0.1).
 */
const scaled = (name: string, offset: number, factor: number): FieldCodec => ({
  name,
  decode: bytes => Math.round(bytes[offset]! * factor * 10) / 10,
  encode: (value, bytes) => { bytes[offset] = Math.round((value as number) / factor); },
});

/**
 * A big-endian 16-bit unsigned integer spanning two consecutive bytes.
 * Used for millisecond delay times that exceed 255 ms.
 */
const u16be = (name: string, offset: number): FieldCodec => ({
  name,
  decode: bytes => (bytes[offset]! << 8) | bytes[offset + 1]!,
  encode: (value, bytes) => {
    const n = value as number;
    bytes[offset]     = n >> 8;
    bytes[offset + 1] = n & 0xFF;
  },
});


// ── Generic walkers ───────────────────────────────────────────────────────────

/**
 * Decode a list of fields from a byte array.
 * Returns a plain object mapping field names to decoded values.
 */
const decodeFields = (fields: FieldCodec[], bytes: number[]): FxParams =>
  Object.fromEntries(fields.map(f => [f.name, f.decode(bytes)]));

/**
 * Encode a list of fields into a mutable byte array.
 * The array should already contain the original bytes (unknown fields are preserved).
 * Only positions covered by the field list are modified.
 */
const encodeFields = (fields: FieldCodec[], params: FxParams, bytes: number[]): void => {
  for (const field of fields) {
    const value = params[field.name];
    if (value !== undefined) field.encode(value, bytes);
  }
};

export type { FieldCodec };
export { u8, signed, lookup, scaled, u16be, decodeFields, encodeFields };
