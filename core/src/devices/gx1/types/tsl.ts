/** Sparse lookup map of named parameter lists as stored in the TSL JSON envelope. */
type RawParamSet = Record<string, string[]>;

/** One patch as the envelope stores it: the device's own note field, then its parameter blocks. */
interface TslPatch {
  memo?: string;
  paramSet: RawParamSet;
}

/** Top-level structure of the `.tsl` JSON file as written/read by the device. */
interface TslEnvelope {
  name: string;
  formatRev: string;
  device: string;
  data: [TslPatch[], TslPatch[]];
}

/**
 * FX parameter values. String fields are lookup names (e.g. "SLOW" for rotary speed); boolean
 * fields are on/off toggles (e.g. a delay `trigger`). An effect type this codec has no field map
 * for carries none of them, since there is nothing named to read its bytes as.
 */
type FxParams = Record<string, string | number | boolean>;

export type { RawParamSet, TslPatch, TslEnvelope, FxParams };
