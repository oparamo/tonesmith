const bytesFromHex = (hexList: string[]): number[] =>
  hexList.map(hex => parseInt(hex, 16));

/** JSON.stringify renders NaN and Infinity as null, which hides the value being rejected. */
const shownValue = (value: unknown): string =>
  typeof value === "string" ? JSON.stringify(value) : String(value);

/**
 * The last line of defense against writing a corrupt file. `toString(16)` returns a string
 * argument unchanged, renders a negative as "-1C2", and padStart leaves anything already two
 * characters alone, so an unvalidated value used to reach the file looking like a byte. Every
 * write goes through here, so no block or field codec can bypass the check.
 */
const hexFromBytes = (byteList: number[]): string[] =>
  byteList.map((byte, index) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new RangeError(`Byte ${index} is not an integer 0–255: ${shownValue(byte)}`);
    }
    return byte.toString(16).toUpperCase().padStart(2, "0");
  });

/**
 * Falls back to an "UNKNOWN_<label><index>" sentinel for an out-of-range index, so malformed
 * device data survives a decode/encode round trip instead of throwing.
 */
const lookupName = (table: readonly string[], index: number, label = ""): string =>
  (index >= 0 && index < table.length) ? table[index] : `UNKNOWN_${label}${index}`;

/** Throws on an unknown name: callers should only pass values decoded from the same table. */
const lookupIndex = (tableMap: Record<string, number>, name: string, label = ""): number => {
  if (!(name in tableMap)) throw new Error(`Unknown ${label}: "${name}"`);
  return tableMap[name];
};

/**
 * Decodes a byte stored as an offset from a center point: center=50, raw=60 gives 10; raw=40
 * gives -10. Covers the EQ gains and tone controls (center 50) and the pitch and bias fields,
 * whose center is whatever byte value means zero pitch (e.g. 24, 12).
 */
const toSigned = (raw: number, center = 50): number => raw - center;

const toUnsigned = (value: number, center = 50): number => value + center;

export { bytesFromHex, hexFromBytes, lookupName, lookupIndex, shownValue, toSigned, toUnsigned };
