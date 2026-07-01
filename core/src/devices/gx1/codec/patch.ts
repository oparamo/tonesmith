import { RAW, PARAM_SUBTYPE_EFFECTS } from "../common";
import type { Patch, RawParamSet } from "../types";
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
  const paramSet = raw.paramSet;

  const patch: Patch = {
    name:   decodeName(paramSet["MEMORY%COM"]!),
    memo:   raw.memo ?? "",
    chain:  decodeChain(paramSet["MEMORY%CHAIN"]!),
    amp:    decodeAmp(paramSet["MEMORY%AMP"]!),
    odds:   decodeOdDs(paramSet["MEMORY%ODDS"]!),
    ns:     decodeNs(paramSet["MEMORY%NS"]!),
    fv:     decodeFv(paramSet["MEMORY%FV"]!),
    delay:  decodeDelay(paramSet["MEMORY%DLY"]!),
    reverb: decodeReverb(paramSet["MEMORY%REV"]!),
    fx1: { ...decodeFxCom(paramSet["MEMORY%FX1_COM"]!), params: {} },
    fx2: { ...decodeFxCom(paramSet["MEMORY%FX2_COM"]!), params: {} },
    fx3: { ...decodeFxCom(paramSet["MEMORY%FX3_COM"]!), params: {} },
    [RAW]: paramSet,
  };

  // Effects in this set store their type/mode in param-block byte p[0] rather than
  // in FX_COM byte[2]. After decoding, promote params["type"] back to block.subType
  // so the display layer can show e.g. "COMPRESSOR (D-COMP)".
  for (const slot of ["FX1", "FX2", "FX3"] as const) {
    const fxKey = slot.toLowerCase() as "fx1" | "fx2" | "fx3";
    const block = patch[fxKey];
    const params = decodeFxParams(
      block.type,
      block.subType,
      bytesFromHex(paramSet[`MEMORY%${slot}`]!),
    );
    if (PARAM_SUBTYPE_EFFECTS.has(block.type) && typeof params["type"] === "string") {
      block.subType = params["type"];
    }
    block.params = params;
  }

  return patch;
};

/**
 * Encode a Patch back to a raw param set.
 * Starts from the original param set (stored under RAW) and overwrites only the
 * fields this codec knows about — unknown/unreversed bytes are preserved exactly.
 */
const encodePatch = (patch: Patch): { memo: string; paramSet: RawParamSet } => {
  const paramSet: RawParamSet = { ...patch[RAW] };

  paramSet["MEMORY%COM"]   = encodeName(patch.name);
  paramSet["MEMORY%CHAIN"] = encodeChain(patch.chain);
  paramSet["MEMORY%AMP"]   = encodeAmp(patch.amp);
  paramSet["MEMORY%ODDS"]  = encodeOdDs(patch.odds);
  paramSet["MEMORY%NS"]    = encodeNs(patch.ns);
  paramSet["MEMORY%FV"]    = encodeFv(patch.fv);
  paramSet["MEMORY%DLY"]   = encodeDelay(patch.delay);
  paramSet["MEMORY%REV"]   = encodeReverb(patch.reverb);

  for (const slot of ["FX1", "FX2", "FX3"] as const) {
    const fxKey = slot.toLowerCase() as "fx1" | "fx2" | "fx3";
    const block = patch[fxKey];
    paramSet[`MEMORY%${slot}_COM`] = encodeFxCom(block);
    const originalParamBytes = bytesFromHex(patch[RAW][`MEMORY%${slot}`]!);
    paramSet[`MEMORY%${slot}`] = encodeFxParams(block.type, block.params, originalParamBytes);
  }

  return { memo: patch.memo, paramSet };
};

export { decodePatch, encodePatch };
