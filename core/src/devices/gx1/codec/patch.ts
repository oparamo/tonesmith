import { RAW, PARAM_SUBTYPE_EFFECTS } from "../common";
import type { Patch, RawParamSet } from "../types";
import { bytesFromHex } from "./primitives";
import { decodeFxParams, encodeFxParams } from "./fx-params";
import {
  decodeName, encodeName,
  decodeKey, encodeKey,
  decodeChain, encodeChain,
  decodeAmp, encodeAmp,
  decodeOdDs, encodeOdDs,
  decodeNs, encodeNs,
  decodeFv, encodeFv,
  decodeFxCom, encodeFxCom,
  decodeDelay, encodeDelay,
  decodeReverb, encodeReverb,
  decodePfx, encodePfx,
} from "./blocks";

const FX_SLOTS = ["fx1", "fx2", "fx3"] as const;
type FxSlot = typeof FX_SLOTS[number];

/**
 * Which raw block holds an FX slot's params. OVERTONE (FX3 only) keeps its in the separate
 * 5-byte MEMORY%FX3A block rather than the shared 251-byte FX param block.
 */
const paramBlockKey = (slot: FxSlot, type: string): string => {
  if (slot === "fx3" && type === "OVERTONE") return "MEMORY%FX3A";
  return `MEMORY%${slot.toUpperCase()}`;
};

/**
 * Decode a raw GX-1 param set (the map of hex-array fields from the TSL JSON
 * envelope) into a fully typed Patch. The original param set is preserved under
 * the RAW symbol so encodePatch can start from it and overwrite only known fields.
 */
const decodePatch = (raw: { memo?: string; paramSet: RawParamSet }): Patch => {
  const paramSet = raw.paramSet;

  const patch: Patch = {
    name:   decodeName(paramSet["MEMORY%COM"]),
    memo:   raw.memo ?? "",
    chain:  decodeChain(paramSet["MEMORY%CHAIN"]),
    key:    decodeKey(paramSet["MEMORY%OTHER"]),
    amp:    decodeAmp(paramSet["MEMORY%AMP"]),
    odds:   decodeOdDs(paramSet["MEMORY%ODDS"]),
    ns:     decodeNs(paramSet["MEMORY%NS"]),
    fv:     decodeFv(paramSet["MEMORY%FV"]),
    pfx:    decodePfx(paramSet["MEMORY%PFX"]),
    delay:  decodeDelay(paramSet["MEMORY%DLY"]),
    reverb: decodeReverb(paramSet["MEMORY%REV"]),
    fx1: { ...decodeFxCom(paramSet["MEMORY%FX1_COM"]), params: {} },
    fx2: { ...decodeFxCom(paramSet["MEMORY%FX2_COM"]), params: {} },
    fx3: { ...decodeFxCom(paramSet["MEMORY%FX3_COM"]), params: {} },
    [RAW]: paramSet,
  };

  // Effects in this set store their sub-model in param-block byte p[0] rather than in FX_COM
  // byte[2]. After decoding, promote it from the params bag onto block.subType, so the display
  // layer can show e.g. "COMPRESSOR (D-COMP)".
  for (const slot of FX_SLOTS) {
    const block = patch[slot];
    const paramBlockBytes = bytesFromHex(paramSet[paramBlockKey(slot, block.type)]);
    const params = decodeFxParams(block.type, paramBlockBytes);
    if (PARAM_SUBTYPE_EFFECTS.has(block.type) && typeof params.subType === "string") {
      block.subType = params.subType;
    }
    block.params = params;
  }

  return patch;
};

/**
 * Encode a Patch back to a raw param set. Starts from the original param set (stored under RAW)
 * and overwrites only the fields this codec knows about, so unreversed bytes survive exactly.
 */
const encodePatch = (patch: Patch): { memo: string; paramSet: RawParamSet } => {
  const paramSet: RawParamSet = { ...patch[RAW] };

  paramSet["MEMORY%COM"]   = encodeName(patch.name);
  paramSet["MEMORY%CHAIN"] = encodeChain(patch.chain, patch[RAW]["MEMORY%CHAIN"]);
  paramSet["MEMORY%OTHER"] = encodeKey(patch.key, patch[RAW]["MEMORY%OTHER"]);
  paramSet["MEMORY%AMP"]   = encodeAmp(patch.amp);
  paramSet["MEMORY%ODDS"]  = encodeOdDs(patch.odds);
  paramSet["MEMORY%NS"]    = encodeNs(patch.ns);
  paramSet["MEMORY%FV"]    = encodeFv(patch.fv);
  paramSet["MEMORY%PFX"]   = encodePfx(patch.pfx);
  paramSet["MEMORY%DLY"]   = encodeDelay(patch.delay);
  paramSet["MEMORY%REV"]   = encodeReverb(patch.reverb);

  for (const slot of FX_SLOTS) {
    const block = patch[slot];
    paramSet[`MEMORY%${slot.toUpperCase()}_COM`] = encodeFxCom(block);
    const blockKey = paramBlockKey(slot, block.type);
    const originalParamBytes = bytesFromHex(patch[RAW][blockKey]);
    paramSet[blockKey] = encodeFxParams(block.type, block.params, originalParamBytes);
  }

  return { memo: patch.memo, paramSet };
};

export { decodePatch, encodePatch };
