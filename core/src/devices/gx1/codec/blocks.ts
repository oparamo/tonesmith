import {
  AMP_TYPES, AMP_TYPE_IDX,
  SP_TYPES, SP_TYPE_IDX,
  MIC_TYPES, MIC_TYPE_IDX,
  ODDS_TYPES, ODDS_IDX,
  DLY_TYPES, DLY_TYPE_IDX,
  REV_TYPES, REV_TYPE_IDX,
  CHAIN_NAMES, CHAIN_IDS,
  NS_DETECT, FV_CURVE, TWIST_MODES,
  FX_SUBTYPE_LISTS,
} from "../common";
import type { FxBlock, FxParams, OdDsBlock, AmpBlock, NsBlock, FvBlock, DelayBlock, ReverbBlock } from "../types";
import { RAW } from "../common";
import { bytesFromHex, hexFromBytes, lookupName, lookupIndex, toSigned, toUnsigned } from "./primitives";
import { u8, signed, lookup, u16be, decodeFields, encodeFields, type FieldCodec } from "./fields";
import { decodeFxType, encodeFxType } from "./fx-params";

// ── Name block ────────────────────────────────────────────────────────────────

const decodeName = (hexList: string[]): string =>
  Buffer.from(hexList.join(""), "hex").toString("ascii").trimEnd();

const encodeName = (name: string, length = 16): string[] => {
  const buffer = Buffer.alloc(length, 0x20);
  buffer.write(name.slice(0, length), "ascii");
  return hexFromBytes(Array.from(buffer));
};


// ── Chain block ───────────────────────────────────────────────────────────────

const decodeChain = (hexList: string[]): string[] =>
  bytesFromHex(hexList).map(chainId => CHAIN_NAMES[chainId] ?? `?${chainId}`);

const encodeChain = (names: string[]): string[] =>
  hexFromBytes(names.map(name => CHAIN_IDS[name] ?? 0));


// ── AMP block (13 bytes) ──────────────────────────────────────────────────────
//
// Layout: [on, type, -, gain, level, bass, middle, treble, speaker, -, mic, -, -]
// Bytes 2, 9, 11, 12 are unused — they pass through via the RAW bytes.

const decodeAmp = (hexList: string[]): AmpBlock => {
  const bytes = bytesFromHex(hexList);
  return {
    on:      Boolean(bytes[0]),
    type:    lookupName(AMP_TYPES, bytes[1]!),
    gain:    bytes[3]!,
    level:   bytes[4]!,
    bass:    bytes[5]!,
    middle:  bytes[6]!,
    treble:  bytes[7]!,
    speaker: lookupName(SP_TYPES,  bytes[8]!),
    mic:     lookupName(MIC_TYPES, bytes[10]!),
    [RAW]:   bytes,
  };
};

const encodeAmp = (block: AmpBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0]  = Number(block.on);
  bytes[1]  = lookupIndex(AMP_TYPE_IDX, block.type,    "AMP type");
  bytes[3]  = block.gain;
  bytes[4]  = block.level;
  bytes[5]  = block.bass;
  bytes[6]  = block.middle;
  bytes[7]  = block.treble;
  bytes[8]  = lookupIndex(SP_TYPE_IDX,  block.speaker, "SP type");
  bytes[10] = lookupIndex(MIC_TYPE_IDX, block.mic,     "MIC type");
  return hexFromBytes(bytes);
};


// ── OD/DS block (8 bytes) ─────────────────────────────────────────────────────
//
// Layout: [on, type, drive, tone(signed), level, direct, -, ?]
// Bytes 6–7 are unknown — they pass through via the RAW bytes.

const decodeOdDs = (hexList: string[]): OdDsBlock => {
  const bytes = bytesFromHex(hexList);
  return {
    on:     Boolean(bytes[0]!),
    type:   lookupName(ODDS_TYPES, bytes[1]!),
    drive:  bytes[2]!,
    tone:   toSigned(bytes[3]!),
    level:  bytes[4]!,
    direct: bytes[5]!,
    [RAW]:  bytes,
  };
};

const encodeOdDs = (block: OdDsBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(ODDS_IDX, block.type, "OD/DS type");
  bytes[2] = block.drive;
  bytes[3] = toUnsigned(block.tone);
  bytes[4] = block.level;
  bytes[5] = block.direct;
  return hexFromBytes(bytes);
};


// ── NS (noise suppressor) block (4 bytes) ─────────────────────────────────────

const decodeNs = (hexList: string[]): NsBlock => {
  const bytes = bytesFromHex(hexList);
  return {
    on:        Boolean(bytes[0]),
    threshold: bytes[1]!,
    release:   bytes[2]!,
    detect:    lookupName(NS_DETECT, bytes[3]!),
    [RAW]:     bytes,
  };
};

const encodeNs = (block: NsBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = block.threshold;
  bytes[2] = block.release;
  const detectIndex = NS_DETECT.indexOf(block.detect as typeof NS_DETECT[number]);
  if (detectIndex >= 0) bytes[3] = detectIndex;
  return hexFromBytes(bytes);
};


// ── FV (foot volume) block (3–4 bytes) ───────────────────────────────────────

const decodeFv = (hexList: string[]): FvBlock => {
  const bytes = bytesFromHex(hexList);
  return {
    position: bytes[0]!,
    min:      bytes[1]!,
    max:      bytes[2]!,
    curve:    bytes.length > 3 ? lookupName(FV_CURVE, bytes[3]!) : "NORMAL",
    [RAW]:    bytes,
  };
};

const encodeFv = (block: FvBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = block.position;
  bytes[1] = block.min;
  bytes[2] = block.max;
  if (bytes.length > 3) {
    const curveIndex = FV_CURVE.indexOf(block.curve as typeof FV_CURVE[number]);
    if (curveIndex >= 0) bytes[3] = curveIndex;
  }
  return hexFromBytes(bytes);
};


// ── FX_COM block (on/type/subType header, 3 bytes) ────────────────────────────

const decodeFxCom = (hexList: string[]): Omit<FxBlock, "params"> => {
  const bytes = bytesFromHex(hexList);
  const [fxType, subType] = decodeFxType(bytes[1]!, bytes[2]!);
  return { on: Boolean(bytes[0]), type: fxType, subType, [RAW]: bytes };
};

const encodeFxCom = (block: FxBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  const [typeByte, subTypeByte] = encodeFxType(block.type, block.subType);
  bytes[1] = typeByte;
  // TODO: review whether byte 2 should always be zeroed or preserved when the fx
  // type has no subType, or when the subType was decoded as unknown. Currently we
  // preserve it in both cases to avoid corrupting data we don't fully understand.
  const subTypeIsKnown =
    FX_SUBTYPE_LISTS[block.type] !== undefined &&
    block.subType !== null &&
    !String(block.subType).startsWith("UNKNOWN_");
  if (subTypeIsKnown) bytes[2] = subTypeByte;
  return hexFromBytes(bytes);
};


// ── Delay block field maps (keyed by delay type) ──────────────────────────────
//
// Bytes 0–1 of the full block are [on, type] — handled in decodeDelay/encodeDelay.
// Field offsets below are relative to byte 2 (the first parameter byte within the block).
//
// Confirmed layout (from SWORD LEAD STANDARD + FAT DIST ANALOG cross-referencing):
//   params[0] unknown   params[1] time (note index or raw ms depending on type)
//   params[2–3] unknown  params[4] feedback  params[5] level  params[6] highCut
//   params[7+] type-specific extras (positions unconfirmed, best-effort)
//
// WARP / TWIST / GLITCH have structurally different layouts — left at original offsets.

const DELAY_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "STANDARD": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
  ],
  "ANALOG": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
  ],
  "MODULATE": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
    u8("modRate", 7), u8("modDepth", 8),
  ],
  "ANLG MOD": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
    u8("modRate", 7), u8("modDepth", 8),
  ],
  "PAN": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
    u8("tapTime", 7),
  ],
  "REVERSE": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
    u8("trigger", 7),
  ],
  "SPACE ECHO": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
    u8("head", 7),
  ],
  "SHIMMER": [
    u8("time", 1), u8("feedback", 4), u8("level", 5), u8("highCut", 6),
    signed("pitch", 7, 24), u8("balance", 8),
  ],
  "WARP": [
    u16be("time", 0), u8("trigger", 2), u8("level", 3),
  ],
  "TWIST": [
    lookup("mode", 0, TWIST_MODES),
    u8("trigger", 1), u8("level", 2), u8("riseTime", 3), u8("fallTime", 4), u8("fadeTime", 5),
  ],
  "GLITCH": [
    u8("trigger", 0), u8("time", 1), u8("glitch", 2), u8("balance", 3),
  ],
};

const decodeDelay = (hexList: string[]): DelayBlock => {
  const bytes = bytesFromHex(hexList);
  const delayType = lookupName(DLY_TYPES, bytes[1]!);
  const block: DelayBlock = { on: Boolean(bytes[0]), type: delayType, [RAW]: bytes };

  const fields = DELAY_TYPE_MAPS[delayType];
  if (fields) Object.assign(block, decodeFields(fields, bytes.slice(2)));
  return block;
};

const encodeDelay = (block: DelayBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(DLY_TYPE_IDX, block.type, "DLY type");

  const fields = DELAY_TYPE_MAPS[block.type];
  if (fields) {
    const paramBytes = bytes.slice(2);
    // Double-assertion needed: DelayBlock extends Record<string, unknown> which isn't
    // directly assignable to FxParams (Record<string, string|number|number[]>) due to
    // the 'on: boolean' field; at runtime we only read the named param fields.
    encodeFields(fields, block as unknown as FxParams, paramBytes);
    bytes.splice(2, paramBytes.length, ...paramBytes);
  }
  return hexFromBytes(bytes);
};


// ── Reverb block (keyed by reverb type) ──────────────────────────────────────

const STANDARD_REVERB_TYPES = ["HALL S", "HALL M", "PLATE", "ROOM S", "ROOM L", "AMBIENCE", "SPRING"] as const;

const decodeReverb = (hexList: string[]): ReverbBlock => {
  const bytes = bytesFromHex(hexList);
  const reverbType = lookupName(REV_TYPES, bytes[1]!);
  const block: ReverbBlock = { on: Boolean(bytes[0]), type: reverbType, [RAW]: bytes };

  if ((STANDARD_REVERB_TYPES as readonly string[]).includes(reverbType)) {
    Object.assign(block, {
      time:       Math.round(bytes[2]! * 0.1 * 10) / 10,
      tone:         toSigned(bytes[3]!),
      density:      bytes[4]! + 1,
      level:        bytes[5]!,
      preDelay: bytes[7]!,
      direct:       bytes[8]!,
    });
  } else if (reverbType === "SHIMMER") {
    Object.assign(block, {
      time:       Math.round(bytes[2]! * 0.1 * 10) / 10,
      tone:         toSigned(bytes[3]!),
      level:        bytes[4]!,
      preDelay: bytes[5]!,
      pitch:        bytes[6]! - 24,
      pitchLvl:    bytes[7]!,
    });
  } else if (reverbType === "SUB DELAY") {
    Object.assign(block, {
      time:     (bytes[2]! << 8) | bytes[3]!,
      feedback: bytes[4]!,
      level:    bytes[5]!,
      highCut: bytes[6]!,
    });
  } else if (reverbType === "TERA ECHO") {
    Object.assign(block, {
      time:   bytes[2]!,
      tone:     toSigned(bytes[3]!),
      level:    bytes[4]!,
      feedback: bytes[5]!,
      direct:   bytes[6]!,
      trigger:  bytes[7]!,
    });
  }
  return block;
};

const encodeReverb = (block: ReverbBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(REV_TYPE_IDX, block.type, "REV type");

  const getParam = (key: string, fallback = 0): number => (block[key] as number) ?? fallback;

  if ((STANDARD_REVERB_TYPES as readonly string[]).includes(block.type)) {
    bytes[2] = Math.round(getParam("time") / 0.1);
    bytes[3] = toUnsigned(getParam("tone"));
    bytes[4] = getParam("density") - 1;
    bytes[5] = getParam("level");
    bytes[7] = getParam("preDelay");
    bytes[8] = getParam("direct");
  } else if (block.type === "SHIMMER") {
    bytes[2] = Math.round(getParam("time") / 0.1);
    bytes[3] = toUnsigned(getParam("tone"));
    bytes[4] = getParam("level");
    bytes[5] = getParam("preDelay");
    bytes[6] = getParam("pitch") + 24;
    bytes[7] = getParam("pitchLvl");
  } else if (block.type === "SUB DELAY") {
    const ms = getParam("time");
    bytes[2] = ms >> 8;
    bytes[3] = ms & 0xFF;
    bytes[4] = getParam("feedback");
    bytes[5] = getParam("level");
    bytes[6] = getParam("highCut");
  } else if (block.type === "TERA ECHO") {
    bytes[2] = getParam("time");
    bytes[3] = toUnsigned(getParam("tone"));
    bytes[4] = getParam("level");
    bytes[5] = getParam("feedback");
    bytes[6] = getParam("direct");
    bytes[7] = getParam("trigger");
  }
  return hexFromBytes(bytes);
};

export {
  decodeName, encodeName,
  decodeChain, encodeChain,
  decodeAmp, encodeAmp,
  decodeOdDs, encodeOdDs,
  decodeNs, encodeNs,
  decodeFv, encodeFv,
  decodeFxCom, encodeFxCom,
  decodeDelay, encodeDelay,
  decodeReverb, encodeReverb,
};
