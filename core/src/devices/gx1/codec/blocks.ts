import {
  AMP_TYPES, AMP_TYPE_IDX,
  SP_TYPES, SP_TYPE_IDX,
  MIC_TYPES, MIC_TYPE_IDX,
  ODDS_TYPES, ODDS_IDX,
  DLY_TYPES, DLY_TYPE_IDX,
  REV_TYPES, REV_TYPE_IDX,
  PFX_TYPES, PFX_TYPE_IDX, WAH_TYPES,
  CHAIN_BLOCK_ORDER, CHAIN_VALUE_TO_NAME, CHAIN_NAME_TO_VALUE, CHAIN_TERMINATOR,
  NS_DETECT, FV_CURVE, TWIST_MODES, ON_OFF, SPACE_ECHO_HEAD,
} from "../common";
import type { FxBlock, FxParams, OdDsBlock, AmpBlock, NsBlock, FvBlock, DelayBlock, ReverbBlock, PfxBlock } from "../types";
import { RAW } from "../common";
import { bytesFromHex, hexFromBytes, lookupName, lookupIndex, toSigned, toUnsigned } from "./primitives";
import { u8, signed, lookup, scaled, nibblePair, nibbleQuad, decodeFields, encodeFields, type FieldCodec } from "./fields";
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
//
// A linked list, not a positional array: byte 0 holds the firmware value of whichever
// block comes first; byte CHAIN_NEXT_SLOT[name] holds the firmware value of whatever
// comes immediately after that block. CHAIN_TERMINATOR means "connects to OUTPUT."

const CHAIN_NEXT_SLOT: Record<string, number> = Object.fromEntries(
  CHAIN_BLOCK_ORDER.map((name, index) => [name, index + 1])
);

const decodeChain = (hexList: string[]): string[] => {
  const bytes = bytesFromHex(hexList);
  const order: string[] = [];
  let value = bytes[0]!;
  while (value !== CHAIN_TERMINATOR && order.length < CHAIN_BLOCK_ORDER.length) {
    const name = CHAIN_VALUE_TO_NAME[value];
    if (name === undefined) break;
    order.push(name);
    value = bytes[CHAIN_NEXT_SLOT[name]!]!;
  }
  return order;
};

const encodeChain = (names: string[], originalHexList: string[]): string[] => {
  const bytes = bytesFromHex(originalHexList);
  const valueOf = (name: string | undefined): number =>
    name === undefined ? CHAIN_TERMINATOR : lookupIndex(CHAIN_NAME_TO_VALUE, name, "chain block");

  bytes[0] = valueOf(names[0]);
  names.forEach((name, index) => {
    bytes[CHAIN_NEXT_SLOT[name]!] = valueOf(names[index + 1]);
  });
  return hexFromBytes(bytes);
};


// ── AMP block (13 bytes) ──────────────────────────────────────────────────────
//
// Layout: [on, type, type_bass, gain, level, bass, middle, treble, speaker,
//          sp_type_bass, mic, solo, soloLevel]
// Bytes 2 and 9 are the bass-mode mirrors of type/speaker — guitar-mode
// out-of-scope, same pattern as FX_COM's byte 2 (see decodeFxCom below).

const decodeAmp = (hexList: string[]): AmpBlock => {
  const bytes = bytesFromHex(hexList);
  return {
    on:        Boolean(bytes[0]),
    type:      lookupName(AMP_TYPES, bytes[1]!),
    gain:      bytes[3]!,
    level:     bytes[4]!,
    bass:      bytes[5]!,
    middle:    bytes[6]!,
    treble:    bytes[7]!,
    speaker:   lookupName(SP_TYPES,  bytes[8]!),
    mic:       lookupName(MIC_TYPES, bytes[10]!),
    solo:      Boolean(bytes[11]),
    soloLevel: bytes[12]!,
    [RAW]:     bytes,
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
  bytes[11] = Number(block.solo);
  bytes[12] = block.soloLevel;
  return hexFromBytes(bytes);
};


// ── OD/DS block (8 bytes) ─────────────────────────────────────────────────────
//
// Layout: [on, type, drive, tone(signed), level, direct, solo, soloLevel]

const decodeOdDs = (hexList: string[]): OdDsBlock => {
  const bytes = bytesFromHex(hexList);
  return {
    on:        Boolean(bytes[0]!),
    type:      lookupName(ODDS_TYPES, bytes[1]!),
    drive:     bytes[2]!,
    tone:      toSigned(bytes[3]!),
    level:     bytes[4]!,
    direct:    bytes[5]!,
    solo:      Boolean(bytes[6]),
    soloLevel: bytes[7]!,
    [RAW]:     bytes,
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
  bytes[6] = Number(block.solo);
  bytes[7] = block.soloLevel;
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


// ── FX_COM block (on/type header + bass-mode type mirror, 3 bytes) ────────────
//
// Byte 2 is the bass-mode mirror of byte 1's type selector (used when the device is
// in bass mode) — it never carries a subtype for any effect. Effects that have their
// own sub-model (COMPRESSOR, LIMITER, AC RESO, CHORUS, CLASSIC-VIBE, HUMANIZER, OD/DS)
// store it in the FX param block itself (see PARAM_SUBTYPE_EFFECTS in common/constants.ts),
// not here. Byte 2 is guitar-mode-out-of-scope and always passed through untouched.

const decodeFxCom = (hexList: string[]): Omit<FxBlock, "params"> => {
  const bytes = bytesFromHex(hexList);
  const fxType = decodeFxType(bytes[1]!);
  return { on: Boolean(bytes[0]), type: fxType, subType: null, [RAW]: bytes };
};

const encodeFxCom = (block: FxBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = encodeFxType(block.type);
  return hexFromBytes(bytes);
};


// ── Delay block field maps (keyed by delay type) ──────────────────────────────
//
// Bytes 0–1 of the full block are [on, type] — handled in decodeDelay/encodeDelay.
// All other offsets below are absolute byte positions within the full block.
//
// Many fields are shared across types at the same address (e.g. feedback/level/highCut
// at 6/7/8 for every "clean" delay type, or trigger/level at 21/25 shared by WARP,
// TWIST, and GLITCH) rather than each type getting its own compact, contiguous layout.

const DELAY_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "STANDARD": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
  ],
  "MODULATE": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
    u8("modRate", 9), u8("modDepth", 10),
  ],
  "PAN": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
    u8("tapTime", 11),
  ],
  "REVERSE": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
    lookup("trigger", 12, ON_OFF),
  ],
  "ANALOG": [
    nibbleQuad("time", 13), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
  ],
  "ANLG MOD": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
    u8("modRate", 9), u8("modDepth", 10),
  ],
  "SPACE ECHO": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
    lookup("head", 17, SPACE_ECHO_HEAD),
  ],
  "SHIMMER": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), u8("highCut", 8),
    signed("pitch", 18, 24), u8("balance", 19),
  ],
  "WARP": [
    nibbleQuad("time", 2), u8("trigger", 21), u8("level", 25),
  ],
  "TWIST": [
    lookup("mode", 20, TWIST_MODES), u8("trigger", 21),
    u8("riseTime", 22), u8("fallTime", 23), u8("fadeTime", 24), u8("level", 25),
  ],
  "GLITCH": [
    u8("trigger", 21), u8("time", 26), u8("glitch", 27), u8("balance", 28),
  ],
};

const decodeDelay = (hexList: string[]): DelayBlock => {
  const bytes = bytesFromHex(hexList);
  const delayType = lookupName(DLY_TYPES, bytes[1]!);
  const block: DelayBlock = { on: Boolean(bytes[0]), type: delayType, [RAW]: bytes };

  const fields = DELAY_TYPE_MAPS[delayType];
  if (fields) Object.assign(block, decodeFields(fields, bytes));
  return block;
};

const encodeDelay = (block: DelayBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(DLY_TYPE_IDX, block.type, "DLY type");

  const fields = DELAY_TYPE_MAPS[block.type];
  if (fields) {
    // Double-assertion needed: DelayBlock extends Record<string, unknown> which isn't
    // directly assignable to FxParams (Record<string, string|number|number[]>) due to
    // the 'on: boolean' field; at runtime we only read the named param fields.
    encodeFields(fields, block as unknown as FxParams, bytes);
  }
  return hexFromBytes(bytes);
};


// ── Reverb block (keyed by reverb type) ──────────────────────────────────────
//
// All offsets below are absolute byte positions within the full block. As with the
// delay block, several fields are shared across types at the same address (tone at
// 3, level at 5, direct at 8, preDelay at 6, feedback at 16) rather than each type
// getting its own compact layout.

const STANDARD_REVERB_TYPES = ["HALL S", "HALL M", "PLATE", "ROOM S", "ROOM L", "AMBIENCE", "SPRING"] as const;

const REV_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "STANDARD": [
    scaled("time", 2, 0.1), signed("tone", 3, 50), signed("density", 4, -1),
    u8("level", 5), nibblePair("preDelay", 6), u8("direct", 8),
  ],
  "SHIMMER": [
    scaled("time", 2, 0.1), signed("tone", 3, 50), nibblePair("preDelay", 6),
    signed("pitch", 9, 24), u8("level", 10),
  ],
  "SUB DELAY": [
    nibbleQuad("time", 11), u8("level", 15), u8("feedback", 16), u8("highCut", 17),
  ],
  "TERA ECHO": [
    signed("tone", 3, 50), u8("level", 5), u8("direct", 8),
    u8("feedback", 16), u8("spreadTime", 18), u8("trigger", 19),
  ],
};

const decodeReverb = (hexList: string[]): ReverbBlock => {
  const bytes = bytesFromHex(hexList);
  const reverbType = lookupName(REV_TYPES, bytes[1]!);
  const block: ReverbBlock = { on: Boolean(bytes[0]), type: reverbType, [RAW]: bytes };

  const fields = (STANDARD_REVERB_TYPES as readonly string[]).includes(reverbType)
    ? REV_TYPE_MAPS["STANDARD"]
    : REV_TYPE_MAPS[reverbType];
  if (fields) Object.assign(block, decodeFields(fields, bytes));
  return block;
};

const encodeReverb = (block: ReverbBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(REV_TYPE_IDX, block.type, "REV type");

  const fields = (STANDARD_REVERB_TYPES as readonly string[]).includes(block.type)
    ? REV_TYPE_MAPS["STANDARD"]
    : REV_TYPE_MAPS[block.type];
  if (fields) {
    // Double-assertion needed: ReverbBlock extends Record<string, unknown> which isn't
    // directly assignable to FxParams (Record<string, string|number|number[]>) due to
    // the 'on: boolean' field; at runtime we only read the named param fields.
    encodeFields(fields, block as unknown as FxParams, bytes);
  }
  return hexFromBytes(bytes);
};

// ── PFX (expression pedal effect: WAH / PEDAL BEND) block (14 bytes) ──────────
//
// Byte 3 (wah_type_bass) is the bass-mode mirror of byte 2's wah type — guitar-mode
// out-of-scope, same pattern as AMP/FX_COM's other bass-mode mirror bytes. Both
// WAH's and PEDAL BEND's fields always occupy their fixed byte ranges regardless of
// which is currently selected (the same "shadow bytes" union layout as delay/reverb).

const PFX_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "WAH": [
    lookup("wahType", 2, WAH_TYPES), u8("level", 4), u8("direct", 5),
    u8("position", 6), u8("min", 7), u8("max", 8),
  ],
  "PEDAL BEND": [
    signed("pitchMin", 9, 24), signed("pitchMax", 10, 24),
    u8("position", 11), u8("level", 12), u8("direct", 13),
  ],
};

const decodePfx = (hexList: string[]): PfxBlock => {
  const bytes = bytesFromHex(hexList);
  const pfxType = lookupName(PFX_TYPES, bytes[1]!);
  const block: PfxBlock = { on: Boolean(bytes[0]), type: pfxType, [RAW]: bytes };

  const fields = PFX_TYPE_MAPS[pfxType];
  if (fields) Object.assign(block, decodeFields(fields, bytes));
  return block;
};

const encodePfx = (block: PfxBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(PFX_TYPE_IDX, block.type, "PFX type");

  const fields = PFX_TYPE_MAPS[block.type];
  if (fields) {
    // Double-assertion needed: PfxBlock extends Record<string, unknown> which isn't
    // directly assignable to FxParams (Record<string, string|number|number[]>) due to
    // the 'on: boolean' field; at runtime we only read the named param fields.
    encodeFields(fields, block as unknown as FxParams, bytes);
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
  decodePfx, encodePfx,
  DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS,
};
