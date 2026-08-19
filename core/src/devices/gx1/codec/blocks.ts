import {
  AMP_TYPES, AMP_TYPE_IDX,
  SP_TYPES, SP_TYPE_IDX,
  MIC_TYPES, MIC_TYPE_IDX,
  ODDS_TYPES, ODDS_IDX,
  DLY_TYPES, DLY_TYPE_IDX,
  REV_TYPES, REV_TYPE_IDX,
  PFX_TYPES, PFX_TYPE_IDX, WAH_TYPES,
  CHAIN_SLOT_ORDER, CHAIN_VALUE_TO_BLOCK, CHAIN_BLOCK_TO_VALUE, CHAIN_TERMINATOR, DEFAULT_CHAIN,
  NS_DETECT, NS_DETECT_IDX, FV_CURVE, FV_CURVE_IDX, TWIST_MODES, SPACE_ECHO_HEAD, KEY_NAMES, KEY_IDX,
  FREQ_HIGH_CUT, NAME_BYTES, LAST_STORABLE_CHAR, charsAbove, RAW,
} from "../common";
import type {
  FxBlock, DriveBlock, AmpBlock, NoiseGateBlock, VolumeBlock, DelayBlock, ReverbBlock,
  PedalFxBlock,
} from "../types";
import {
  bytesFromHex, hexFromBytes, byteReader, lookupName, lookupIndex, toSigned, toUnsigned,
} from "./primitives";
import {
  u8, signed, lookup, bool, scaled, nibblePair, nibbleQuad,
  decodeFields, encodeFields, liftSubType, withStoredSubType, type FieldCodec,
} from "./fields";
import { decodeFxType, encodeFxType } from "./fx-params";

// ── Name block ────────────────────────────────────────────────────────────────

/**
 * The device writes ASCII, but "ascii" masks bit 7 in both directions, so a byte above 0x7F comes
 * back as a different character and is written back as that one. "latin1" is the same encoding
 * below 0x80 and byte-exact above it, which is what leaves a name this codec did not author alone.
 */
const NAME_ENCODING = "latin1";

/**
 * Why the block cannot hold this name, or undefined when it can. The ceiling is one byte per
 * character rather than ASCII: a name read out of a file may carry any byte, and the encoder's job
 * is to put it back as it was found. What a caller may *author* is narrower, and the spec validator
 * is where that is decided.
 */
const nameIssue = (name: string): string | undefined => {
  const unstorable = charsAbove(LAST_STORABLE_CHAR, name);
  if (unstorable.length > 0) {
    return `Patch name "${name}" uses characters this device has no byte for: ${unstorable.join(" ")}`;
  }
  if (name.length > NAME_BYTES) {
    return `Patch name "${name}" is ${name.length} characters; this device stores ${NAME_BYTES}.`;
  }
  return undefined;
};

const decodeName = (hexList: string[]): string =>
  Buffer.from(hexList.join(""), "hex").toString(NAME_ENCODING).trimEnd();

const encodeName = (name: string): string[] => {
  const issue = nameIssue(name);
  if (issue !== undefined) throw new Error(issue);

  const buffer = Buffer.alloc(NAME_BYTES, 0x20);
  buffer.write(name, NAME_ENCODING);
  return hexFromBytes(Array.from(buffer));
};


// ── Key (MEMORY%OTHER byte 4 only, the rest of that block is out of scope) ───────
//
// memoryLevel/bpm/carryover/tempoHold aren't tied to any modeled effect's output, but
// key is: HARMONIST_HR's scale-degree entries are diatonic, so this is what the device
// uses to resolve them to actual semitones.

const KEY_OFFSET = 4;

const decodeKey = (hexList: string[]): string =>
  lookupName(KEY_NAMES, byteReader(bytesFromHex(hexList), "MEMORY%OTHER")(KEY_OFFSET));

const encodeKey = (key: string, originalHex: string[]): string[] => {
  const bytes = bytesFromHex(originalHex);
  bytes[KEY_OFFSET] = lookupIndex(KEY_IDX, key, "key");
  return hexFromBytes(bytes);
};


// ── Chain block ───────────────────────────────────────────────────────────────
//
// A linked list, not a positional array: byte 0 holds the firmware value of whichever
// block comes first; each block's own slot holds the firmware value of whatever comes
// immediately after it. CHAIN_TERMINATOR means "connects to OUTPUT."

/** Byte holding what follows `name`. Byte 0 names the first block, so a block's slot is its position + 1. */
const nextSlotFor = (name: string): number => {
  const position = (CHAIN_SLOT_ORDER as readonly string[]).indexOf(name);
  if (position < 0) throw new Error(`Unknown chain block "${name}": valid blocks are ${DEFAULT_CHAIN.join(", ")}`);
  return position + 1;
};

const decodeChain = (hexList: string[]): string[] => {
  const bytes = bytesFromHex(hexList);
  const order: string[] = [];
  let value = bytes[0];
  while (value !== undefined && value !== CHAIN_TERMINATOR && order.length < CHAIN_SLOT_ORDER.length) {
    const name = CHAIN_VALUE_TO_BLOCK[value];
    if (name === undefined) break;
    order.push(name);
    value = bytes[nextSlotFor(name)];
  }
  return order;
};

/** Rejects a chain entry that isn't one of the device's blocks, or that repeats one already seen. */
const checkChainEntry = (name: unknown, seen: Set<string>): void => {
  const valid = DEFAULT_CHAIN.join(", ");
  if (typeof name !== "string" || !(name in CHAIN_BLOCK_TO_VALUE)) {
    throw new Error(`Unknown chain block ${JSON.stringify(name)}: valid blocks are ${valid}`);
  }
  if (seen.has(name)) {
    throw new Error(`Chain lists ${name} more than once: each block appears exactly once`);
  }
};

/**
 * A chain is always a permutation of every block, never a subset or a multiset. The firmware stores
 * it as a linked list in which each block's own slot names its successor, so a repeated block
 * overwrites its slot and silently drops everything between the two occurrences. The file still
 * encodes, but blocks vanish. Validating here guards every writer at once (the builder, the CLI's
 * write, and the MCP tools) rather than leaving each to police its own edits.
 */
const validateChain = (names: unknown): void => {
  if (!Array.isArray(names)) {
    throw new Error(
      `Chain must be a list of block names, got ${typeof names}: expected every one of ${DEFAULT_CHAIN.join(", ")}`
    );
  }

  const seen = new Set<string>();
  for (const name of names) {
    checkChainEntry(name, seen);
    seen.add(name as string);
  }

  const missing = DEFAULT_CHAIN.filter(block => !seen.has(block));
  if (missing.length > 0) {
    throw new Error(`Chain is missing ${missing.join(", ")}: every block must appear exactly once`);
  }
};

const encodeChain = (names: string[], originalHexList: string[]): string[] => {
  validateChain(names);
  const bytes = bytesFromHex(originalHexList);
  const valueOf = (name: string | undefined): number =>
    name === undefined ? CHAIN_TERMINATOR : lookupIndex(CHAIN_BLOCK_TO_VALUE, name, "chain block");

  bytes[0] = valueOf(names[0]);
  names.forEach((name, index) => {
    bytes[nextSlotFor(name)] = valueOf(names[index + 1]);
  });
  return hexFromBytes(bytes);
};


// ── AMP block (13 bytes) ──────────────────────────────────────────────────────
//
// Layout: [on, type, type_bass, gain, level, bass, middle, treble, speaker,
//          sp_type_bass, mic, solo, soloLevel]
// Bytes 2 and 9 are the bass-mode mirrors of type/speaker, out of scope in guitar
// mode, same pattern as FX_COM's byte 2 (see decodeFxCom below).

const decodeAmp = (hexList: string[]): AmpBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "AMP");
  return {
    on:   Boolean(at(0)),
    type: lookupName(AMP_TYPES, at(1)),
    params: {
      gain:      at(3),
      level:     at(4),
      bass:      at(5),
      middle:    at(6),
      treble:    at(7),
      speaker:   lookupName(SP_TYPES,  at(8)),
      mic:       lookupName(MIC_TYPES, at(10)),
      solo:      Boolean(at(11)),
      soloLevel: at(12),
    },
    [RAW]: bytes,
  };
};

const encodeAmp = (block: AmpBlock): string[] => {
  const bytes = [...block[RAW]];
  const { params } = block;
  bytes[0]  = Number(block.on);
  bytes[1]  = lookupIndex(AMP_TYPE_IDX, block.type,     "AMP type");
  bytes[3]  = params.gain;
  bytes[4]  = params.level;
  bytes[5]  = params.bass;
  bytes[6]  = params.middle;
  bytes[7]  = params.treble;
  bytes[8]  = lookupIndex(SP_TYPE_IDX,  params.speaker, "SP type");
  bytes[10] = lookupIndex(MIC_TYPE_IDX, params.mic,     "MIC type");
  bytes[11] = Number(params.solo);
  bytes[12] = params.soloLevel;
  return hexFromBytes(bytes);
};


// ── OD/DS block (8 bytes) ─────────────────────────────────────────────────────
//
// Layout: [on, type, drive, tone(signed), level, direct, solo, soloLevel]

const decodeDrive = (hexList: string[]): DriveBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "OD/DS");
  return {
    on:   Boolean(at(0)),
    type: lookupName(ODDS_TYPES, at(1)),
    params: {
      drive:     at(2),
      tone:      toSigned(at(3)),
      level:     at(4),
      direct:    at(5),
      solo:      Boolean(at(6)),
      soloLevel: at(7),
    },
    [RAW]: bytes,
  };
};

const encodeDrive = (block: DriveBlock): string[] => {
  const bytes = [...block[RAW]];
  const { params } = block;
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(ODDS_IDX, block.type, "OD/DS type");
  bytes[2] = params.drive;
  bytes[3] = toUnsigned(params.tone);
  bytes[4] = params.level;
  bytes[5] = params.direct;
  bytes[6] = Number(params.solo);
  bytes[7] = params.soloLevel;
  return hexFromBytes(bytes);
};


// ── NS (noise suppressor) block (4 bytes) ─────────────────────────────────────

const decodeNoiseGate = (hexList: string[]): NoiseGateBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "NS");
  return {
    on: Boolean(at(0)),
    params: {
      threshold: at(1),
      release:   at(2),
      detect:    lookupName(NS_DETECT, at(3)),
    },
    [RAW]: bytes,
  };
};

const encodeNoiseGate = (block: NoiseGateBlock): string[] => {
  const bytes = [...block[RAW]];
  const { params } = block;
  bytes[0] = Number(block.on);
  bytes[1] = params.threshold;
  bytes[2] = params.release;
  bytes[3] = lookupIndex(NS_DETECT_IDX, params.detect, "NS detect");
  return hexFromBytes(bytes);
};


// ── FV (foot volume) block (3–4 bytes) ───────────────────────────────────────

const decodeVolume = (hexList: string[]): VolumeBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "FV");
  const curve = bytes.length > 3 ? lookupName(FV_CURVE, at(3)) : "NORMAL";
  return {
    params: {
      position: at(0),
      min:      at(1),
      max:      at(2),
      curve,
    },
    [RAW]: bytes,
  };
};

const encodeVolume = (block: VolumeBlock): string[] => {
  const bytes = [...block[RAW]];
  const { params } = block;
  bytes[0] = params.position;
  bytes[1] = params.min;
  bytes[2] = params.max;
  // A 3-byte FV block predates the curve control and has no byte to write it to.
  if (bytes.length > 3) bytes[3] = lookupIndex(FV_CURVE_IDX, params.curve, "FV curve");
  return hexFromBytes(bytes);
};


// ── FX_COM block (on/type header + bass-mode type mirror, 3 bytes) ────────────
//
// Byte 2 is the bass-mode mirror of byte 1's type selector and never carries a subtype for any
// effect. Effects that have their own sub-model (COMPRESSOR, LIMITER, AC RESO, CHORUS,
// CLASSIC-VIBE, HUMANIZER, OD/DS) store it in the FX param block itself (see
// PARAM_SUBTYPE_EFFECTS in common/constants.ts), not here. Out of scope in guitar mode, so
// byte 2 is always passed through untouched.

const decodeFxCom = (hexList: string[]): Omit<FxBlock, "params"> => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "FX_COM");
  const fxType = decodeFxType(at(1));
  return { on: Boolean(at(0)), type: fxType, subType: null, [RAW]: bytes };
};

const encodeFxCom = (block: FxBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = encodeFxType(block.type);
  return hexFromBytes(bytes);
};


// ── Delay block field maps (keyed by delay type) ──────────────────────────────
//
// Bytes 0–1 of the full block are [on, type], handled in decodeDelay/encodeDelay.
// All other offsets below are absolute byte positions within the full block.
//
// Many fields are shared across types at the same address (e.g. feedback/level/highCut
// at 6/7/8 for every "clean" delay type, or trigger/level at 21/25 shared by WARP,
// TWIST, and GLITCH) rather than each type getting its own compact, contiguous layout.

const DELAY_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "STANDARD": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
  ],
  "MODULATE": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    u8("modRate", 9), u8("modDepth", 10),
  ],
  "PAN": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    u8("tapTime", 11),
  ],
  "REVERSE": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    bool("trigger", 12),
  ],
  "ANALOG": [
    nibbleQuad("time", 13), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
  ],
  "ANLG MOD": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    u8("modRate", 9), u8("modDepth", 10),
  ],
  "SPACE ECHO": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    lookup("head", 17, SPACE_ECHO_HEAD),
  ],
  "SHIMMER": [
    nibbleQuad("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    signed("pitch", 18, 24), u8("balance", 19),
  ],
  "WARP": [
    nibbleQuad("time", 2), bool("trigger", 21), u8("level", 25),
  ],
  "TWIST": [
    lookup("mode", 20, TWIST_MODES), bool("trigger", 21),
    u8("riseTime", 22), u8("fallTime", 23), u8("fadeTime", 24), u8("level", 25),
  ],
  "GLITCH": [
    bool("trigger", 21), u8("time", 26), u8("glitch", 27), u8("balance", 28),
  ],
};

const decodeDelay = (hexList: string[]): DelayBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "DELAY");
  const delayType = lookupName(DLY_TYPES, at(1));
  const fields = DELAY_TYPE_MAPS[delayType];
  const params = fields ? decodeFields(fields, bytes) : {};
  return { on: Boolean(at(0)), type: delayType, params, [RAW]: bytes };
};

const encodeDelay = (block: DelayBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(DLY_TYPE_IDX, block.type, "DLY type");

  const fields = DELAY_TYPE_MAPS[block.type];
  if (fields) encodeFields(fields, block.params, bytes);
  return hexFromBytes(bytes);
};


// ── Reverb block (keyed by reverb type) ──────────────────────────────────────
//
// All offsets below are absolute byte positions within the full block. As with the
// delay block, several fields are shared across types at the same address (tone at
// 3, level at 5, direct at 8, preDelay at 6, feedback at 16) rather than each type
// getting its own compact layout.

const STANDARD_REVERB_TYPES = ["HALL S", "HALL M", "PLATE", "ROOM S", "ROOM L", "AMBIENCE", "SPRING"] as const;

/** The seven standard types share one layout; the rest each have their own. */
const reverbFields = (type: string): FieldCodec[] | undefined => {
  if ((STANDARD_REVERB_TYPES as readonly string[]).includes(type)) return REV_TYPE_MAPS.STANDARD;
  return REV_TYPE_MAPS[type];
};

const REV_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "STANDARD": [
    scaled("time", 2, 0.1), signed("tone", 3, 50), signed("density", 4, -1),
    u8("level", 5), nibblePair("preDelay", 6), u8("direct", 8),
  ],
  "SHIMMER": [
    scaled("time", 2, 0.1), signed("tone", 3, 50), u8("level", 5), nibblePair("preDelay", 6),
    signed("pitch", 9, 24), u8("pitchLevel", 10),
  ],
  "SUB DELAY": [
    nibbleQuad("time", 11), u8("level", 15), u8("feedback", 16), lookup("highCut", 17, FREQ_HIGH_CUT),
  ],
  "TERA ECHO": [
    signed("tone", 3, 50), u8("level", 5), u8("direct", 8),
    u8("feedback", 16), u8("spreadTime", 18), bool("trigger", 19),
  ],
};

const decodeReverb = (hexList: string[]): ReverbBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "REVERB");
  const reverbType = lookupName(REV_TYPES, at(1));
  const fields = reverbFields(reverbType);
  const params = fields ? decodeFields(fields, bytes) : {};
  return { on: Boolean(at(0)), type: reverbType, params, [RAW]: bytes };
};

const encodeReverb = (block: ReverbBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(REV_TYPE_IDX, block.type, "REV type");

  const fields = reverbFields(block.type);
  if (fields) encodeFields(fields, block.params, bytes);
  return hexFromBytes(bytes);
};

// ── PFX (expression pedal effect: WAH / PEDAL BEND) block (14 bytes) ──────────
//
// Byte 3 is the bass-mode mirror of byte 2's wah model, out of scope in guitar mode, same
// pattern as AMP/FX_COM's other bass-mode mirror bytes. Both WAH's and
// PEDAL BEND's fields always occupy their fixed byte ranges regardless of which is
// currently selected (the same "shadow bytes" union layout as delay/reverb).

const PFX_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "WAH": [
    lookup("subType", 2, WAH_TYPES), u8("level", 4), u8("direct", 5),
    u8("position", 6), u8("min", 7), u8("max", 8),
  ],
  "PEDAL BEND": [
    signed("pitchMin", 9, 24), signed("pitchMax", 10, 24),
    u8("position", 11), u8("level", 12), u8("direct", 13),
  ],
};

const decodePedalFx = (hexList: string[]): PedalFxBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "PFX");
  const pedalFxType = lookupName(PFX_TYPES, at(1));
  const fields = PFX_TYPE_MAPS[pedalFxType];
  const stored = fields === undefined ? {} : decodeFields(fields, bytes);
  const lifted = liftSubType(stored);
  return {
    on: Boolean(at(0)),
    type: pedalFxType,
    subType: lifted.subType,
    params: lifted.params,
    [RAW]: bytes,
  };
};

const encodePedalFx = (block: PedalFxBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(PFX_TYPE_IDX, block.type, "PFX type");

  const fields = PFX_TYPE_MAPS[block.type];
  if (fields) encodeFields(fields, withStoredSubType(block.params, block.subType), bytes);
  return hexFromBytes(bytes);
};

export {
  decodeName, encodeName,
  decodeKey, encodeKey,
  decodeChain, encodeChain, validateChain,
  decodeAmp, encodeAmp,
  decodeDrive, encodeDrive,
  decodeNoiseGate, encodeNoiseGate,
  decodeVolume, encodeVolume,
  decodeFxCom, encodeFxCom,
  decodeDelay, encodeDelay,
  decodeReverb, encodeReverb,
  decodePedalFx, encodePedalFx,
  DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS,
};
