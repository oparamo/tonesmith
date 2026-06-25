/** Sparse lookup map of named parameter lists as stored in the TSL JSON envelope. */
type RawParamSet = Record<string, string[]>;

/** Top-level structure of the `.tsl` JSON file as written/read by the device. */
interface TslEnvelope {
  name: string;
  formatRev: string;
  device: string;
  data: [RawParamSet[], RawParamSet[]];
}

/**
 * FX parameter values. String fields are lookup names (e.g. "SLOW" for rotary speed).
 * The special key "unknownBytes" appears only when the effect type is unrecognised — its
 * value is the raw 32-byte param block, preserved for round-trip safety.
 */
type FxParams = Record<string, string | number | number[]>;

export type { RawParamSet, TslEnvelope, FxParams };
