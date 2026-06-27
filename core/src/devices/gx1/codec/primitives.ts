// ── Hex / byte converters ─────────────────────────────────────────────────────

/** Convert an array of two-character hex strings to a byte array. */
const bytesFromHex = (hexList: string[]): number[] =>
  hexList.map(hex => parseInt(hex, 16));

/** Convert a byte array to an array of two-character uppercase hex strings. */
const hexFromBytes = (byteList: number[]): string[] =>
  byteList.map(byte => byte.toString(16).toUpperCase().padStart(2, "0"));


// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Return the name at the given index in a lookup table.
 * Falls back to "UNKNOWN_<label><index>" when the index is out of range,
 * preserving unknown bytes rather than throwing on malformed device data.
 */
const lookupName = (table: readonly string[], index: number, label = ""): string =>
  (index >= 0 && index < table.length) ? table[index]! : `UNKNOWN_${label}${index}`;

/**
 * Return the index of a name in a lookup table.
 * Throws when the name is not found — callers should only pass values that were
 * originally decoded from the same table.
 */
const lookupIndex = (tableMap: Record<string, number>, name: string, label = ""): number => {
  const index = tableMap[name];
  if (index === undefined) throw new Error(`Unknown ${label}: ${JSON.stringify(name)}`);
  return index;
};


// ── Signed / unsigned conversion ──────────────────────────────────────────────

/**
 * Decode a raw byte value to a signed offset from a centre point.
 * Example: centre=50, raw=60 → decoded=10; raw=40 → decoded=−10.
 * Covers GX-1 parameters that are stored as offset-from-centre (EQ bands, tone, etc.)
 * and also pitch/bias fields where centre is the zero-pitch byte value (e.g. 24, 12).
 */
const toSigned = (raw: number, centre = 50): number => raw - centre;

/** Inverse of toSigned: encode a signed value back to a raw byte. */
const toUnsigned = (value: number, centre = 50): number => value + centre;

export { bytesFromHex, hexFromBytes, lookupName, lookupIndex, toSigned, toUnsigned };
