import { RAW, SUB_TYPE_FIELD } from "../common";
import type { FxBlock, FxParams, Patch, RawParamSet } from "../types";
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
 * Splits what the byte layer read into the block's sub-model selection and its params proper. Nine
 * effects and DELAY's five sub-algorithms store the selector in param-block byte p[0], so it comes
 * back as an ordinary field; a decoded block carries that selection once, under `subType`, so a
 * consumer is never left choosing which of two copies to set. Whether a type has the byte at all is
 * read off its field map rather than a separate list, so the two cannot disagree.
 */
const liftSubType = (stored: FxParams): { subType: string | null; params: FxParams } => {
  const { [SUB_TYPE_FIELD]: selector, ...params } = stored;
  const subType = typeof selector === "string" ? selector : null;
  return { subType, params };
};

/** The inverse: the byte layer writes p[0] from the same record as every other param. */
const storedParams = (block: FxBlock): FxParams => {
  if (block.subType === null) return block.params;
  return { ...block.params, [SUB_TYPE_FIELD]: block.subType };
};

/**
 * A raw block this codec reads. `readFile` checks the same list at the file boundary, but decoding
 * is public on the driver, so a param set assembled by hand arrives here having passed no check.
 */
const blockAt = (paramSet: RawParamSet, key: string): string[] => {
  const block = paramSet[key];
  if (block === undefined) throw new Error(`Patch has no ${key} block.`);
  return block;
};

/**
 * Decode a raw GX-1 param set (the map of hex-array fields from the TSL JSON
 * envelope) into a fully typed Patch. The original param set is preserved under
 * the RAW symbol so encodePatch can start from it and overwrite only known fields.
 */
const decodePatch = (raw: { memo?: string; paramSet: RawParamSet }): Patch => {
  const paramSet = raw.paramSet;
  const rawBlock = (key: string): string[] => blockAt(paramSet, key);

  const patch: Patch = {
    name:   decodeName(rawBlock("MEMORY%COM")),
    memo:   raw.memo ?? "",
    chain:  decodeChain(rawBlock("MEMORY%CHAIN")),
    key:    decodeKey(rawBlock("MEMORY%OTHER")),
    amp:    decodeAmp(rawBlock("MEMORY%AMP")),
    odds:   decodeOdDs(rawBlock("MEMORY%ODDS")),
    ns:     decodeNs(rawBlock("MEMORY%NS")),
    fv:     decodeFv(rawBlock("MEMORY%FV")),
    pfx:    decodePfx(rawBlock("MEMORY%PFX")),
    delay:  decodeDelay(rawBlock("MEMORY%DLY")),
    reverb: decodeReverb(rawBlock("MEMORY%REV")),
    fx1: { ...decodeFxCom(rawBlock("MEMORY%FX1_COM")), params: {} },
    fx2: { ...decodeFxCom(rawBlock("MEMORY%FX2_COM")), params: {} },
    fx3: { ...decodeFxCom(rawBlock("MEMORY%FX3_COM")), params: {} },
    [RAW]: paramSet,
  };

  for (const slot of FX_SLOTS) {
    const block = patch[slot];
    const paramBlockBytes = bytesFromHex(rawBlock(paramBlockKey(slot, block.type)));
    const lifted = liftSubType(decodeFxParams(block.type, paramBlockBytes));
    block.subType = lifted.subType;
    block.params = lifted.params;
  }

  return patch;
};

/**
 * Encode a Patch back to a raw param set. Starts from the original param set (stored under RAW)
 * and overwrites only the fields this codec knows about, so unreversed bytes survive exactly.
 */
const encodePatch = (patch: Patch): { memo: string; paramSet: RawParamSet } => {
  const paramSet: RawParamSet = { ...patch[RAW] };
  const rawBlock = (key: string): string[] => blockAt(patch[RAW], key);

  paramSet["MEMORY%COM"]   = encodeName(patch.name);
  paramSet["MEMORY%CHAIN"] = encodeChain(patch.chain, rawBlock("MEMORY%CHAIN"));
  paramSet["MEMORY%OTHER"] = encodeKey(patch.key, rawBlock("MEMORY%OTHER"));
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
    const originalParamBytes = bytesFromHex(rawBlock(blockKey));
    paramSet[blockKey] = encodeFxParams(block.type, storedParams(block), originalParamBytes);
  }

  return { memo: patch.memo, paramSet };
};

export { decodePatch, encodePatch };
