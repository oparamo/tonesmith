import { RAW } from "../common/index";
import type { Patch, RawParamSet } from "../types/index";
import { bytesFromHex } from "./primitives";
import { decodeFxParams, encodeFxParams } from "./fx-params";
import {
  decodeName, encodeName,
  decodeChain, encodeChain,
  decodeAmp, encodeAmp,
  decodeOdDs, encodeOdDs,
  decodeNs, encodeNs,
  decodeFv, encodeFv,
  decodeFxCom, encodeFxCom,
  decodeDelay, encodeDelay,
  decodeReverb, encodeReverb,
} from "./blocks";

// ── Patch decode / encode ─────────────────────────────────────────────────────

/**
 * Decode a raw GX-1 param set (the map of hex-array fields from the TSL JSON
 * envelope) into a fully typed Patch. The original param set is preserved under
 * the RAW symbol so encodePatch can start from it and overwrite only known fields.
 */
const decodePatch = (raw: { memo?: string; paramSet: RawParamSet }): Patch => {
  const ps = raw.paramSet;

  const patch: Patch = {
    name:   decodeName(ps["MEMORY%COM"]!),
    memo:   raw.memo ?? "",
    chain:  decodeChain(ps["MEMORY%CHAIN"]!),
    amp:    decodeAmp(ps["MEMORY%AMP"]!),
    odds:   decodeOdDs(ps["MEMORY%ODDS"]!),
    ns:     decodeNs(ps["MEMORY%NS"]!),
    fv:     decodeFv(ps["MEMORY%FV"]!),
    delay:  decodeDelay(ps["MEMORY%DLY"]!),
    reverb: decodeReverb(ps["MEMORY%REV"]!),
    fx1: { ...decodeFxCom(ps["MEMORY%FX1_COM"]!), params: {} },
    fx2: { ...decodeFxCom(ps["MEMORY%FX2_COM"]!), params: {} },
    fx3: { ...decodeFxCom(ps["MEMORY%FX3_COM"]!), params: {} },
    [RAW]: ps,
  };

  for (const slot of ["FX1", "FX2", "FX3"] as const) {
    const fxKey = slot.toLowerCase() as "fx1" | "fx2" | "fx3";
    const block = patch[fxKey];
    block.params = decodeFxParams(
      block.type,
      block.subtype,
      bytesFromHex(ps[`MEMORY%${slot}`]!),
    );
  }

  return patch;
};

/**
 * Encode a Patch back to a raw param set.
 * Starts from the original param set (stored under RAW) and overwrites only the
 * fields this codec knows about — unknown/unreversed bytes are preserved exactly.
 */
const encodePatch = (patch: Patch): { memo: string; paramSet: RawParamSet } => {
  const ps: RawParamSet = { ...patch[RAW] };

  ps["MEMORY%COM"]   = encodeName(patch.name);
  ps["MEMORY%CHAIN"] = encodeChain(patch.chain);
  ps["MEMORY%AMP"]   = encodeAmp(patch.amp);
  ps["MEMORY%ODDS"]  = encodeOdDs(patch.odds);
  ps["MEMORY%NS"]    = encodeNs(patch.ns);
  ps["MEMORY%FV"]    = encodeFv(patch.fv);
  ps["MEMORY%DLY"]   = encodeDelay(patch.delay);
  ps["MEMORY%REV"]   = encodeReverb(patch.reverb);

  for (const slot of ["FX1", "FX2", "FX3"] as const) {
    const fxKey = slot.toLowerCase() as "fx1" | "fx2" | "fx3";
    const block = patch[fxKey];
    ps[`MEMORY%${slot}_COM`] = encodeFxCom(block);
    const originalParamBytes = bytesFromHex(patch[RAW][`MEMORY%${slot}`]!);
    ps[`MEMORY%${slot}`] = encodeFxParams(block.type, block.subtype, block.params, originalParamBytes);
  }

  return { memo: patch.memo, paramSet: ps };
};

export { decodePatch, encodePatch };
