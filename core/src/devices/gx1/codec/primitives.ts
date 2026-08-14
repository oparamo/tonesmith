const bytesFromHex = (hexList: string[]): number[] =>
  hexList.map(hex => parseInt(hex, 16));

/** JSON.stringify renders NaN and Infinity as null, which hides the value being rejected. */
const shownValue = (value: unknown): string =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

/**
 * `toString(16)` hands back a string argument unchanged and renders a negative as "-1C2", and
 * `padStart(2)` leaves anything already two characters alone, so without the guard a value that is
 * not a byte still comes out looking like one. Every encoder funnels through here, which is what
 * makes this the one place the check cannot be bypassed.
 */
const hexFromBytes = (byteList: number[]): string[] =>
  byteList.map((byte, index) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new RangeError(`Byte ${index} is not an integer 0–255: ${shownValue(byte)}`);
    }
    return byte.toString(16).toUpperCase().padStart(2, "0");
  });

/**
 * A byte the reading decoder's layout says is there. A block shorter than its layout is a truncated
 * file rather than a block of zeros, so defaulting the read would decode the damage into a patch
 * that looks intact; naming the block and what it actually holds is what makes the file the answer.
 */
const byteAt = (bytes: number[], index: number, label: string): number => {
  const byte = bytes[index];
  if (byte === undefined) {
    throw new RangeError(`${label}: no byte ${index}, the block holds ${bytes.length}`);
  }
  return byte;
};

/** `byteAt` bound to one block, for a decoder reading a dozen offsets out of it. */
const byteReader = (bytes: number[], label: string) =>
  (index: number): number => byteAt(bytes, index, label);

/**
 * Falls back to an "UNKNOWN_<label><index>" sentinel for an out-of-range index, so malformed
 * device data survives a decode/encode round trip instead of throwing.
 */
const lookupName = (table: readonly string[], index: number, label = ""): string =>
  table[index] ?? `UNKNOWN_${label}${index}`;

/** Matches a `lookupName` sentinel and captures the index it was built from. */
const SENTINEL_INDEX = /^UNKNOWN_.*?(-?\d+)$/;

/**
 * The inverse of `lookupName`, sentinel included: a name invented for an index outside the table
 * reads back as that index, so a byte this codec cannot name still survives a round trip. Any
 * other unknown name throws, since there is no byte to write for it.
 */
const lookupIndex = (tableMap: Record<string, number>, name: string, label = ""): number => {
  const index = tableMap[name];
  if (index !== undefined) return index;
  const sentinel = SENTINEL_INDEX.exec(name)?.[1];
  if (sentinel === undefined) throw new Error(`Unknown ${label}: "${name}"`);
  return Number(sentinel);
};

/**
 * Decodes a byte stored as an offset from a center point: center=50, raw=60 gives 10; raw=40
 * gives -10. Covers the EQ gains and tone controls (center 50) and the pitch and bias fields,
 * whose center is whatever byte value means zero pitch (e.g. 24, 12).
 */
const toSigned = (raw: number, center = 50): number => raw - center;

const toUnsigned = (value: number, center = 50): number => value + center;

export {
  bytesFromHex, hexFromBytes, byteAt, byteReader,
  lookupName, lookupIndex, shownValue, toSigned, toUnsigned,
};
