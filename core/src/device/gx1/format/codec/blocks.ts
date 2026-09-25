import {
  AMP_TYPES, AMP_TYPE_IDX,
  SP_TYPES,
  MIC_TYPES,
  ODDS_TYPES, ODDS_IDX,
  DLY_TYPES, DLY_TYPE_IDX,
  REV_TYPES, REV_TYPE_IDX,
  PFX_TYPES, PFX_TYPE_IDX, WAH_TYPES,
  CHAIN_SLOT_ORDER, CHAIN_VALUE_TO_BLOCK, CHAIN_BLOCK_TO_VALUE, CHAIN_TERMINATOR, DEFAULT_CHAIN,
  NS_DETECT, FV_CURVE, TWIST_MODES, SPACE_ECHO_HEAD, KEY_NAMES,
  FREQ_HIGH_CUT, NAME_BYTES, LAST_STORABLE_CHAR, charsAbove, RAW, TIME_NOTE_VALUES, SUB_TYPE_FIELD,
} from "../../model";
import type {
  BlockParams, FxBlock, NoiseGateBlock, NoiseGateParams, VolumeBlock, VolumeParams, PedalFxBlock, PatchSettings,
} from "../../model";
import {
  bytesFromHex, hexFromBytes, byteReader, lookupName, lookupIndex,
} from "./primitives";
import {
  u8, signed, lookup, bool, scaled, nibblePair, nibbleQuad, namedAbove, syncedTime,
  decodeFields, encodeFields, liftSubType, withStoredSubType, type FieldCodec,
} from "./fields";
import { decodeFxType, encodeFxType, fxFieldsFor } from "./fxParams";

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


// ── OTHER block: the patch's own settings (7 bytes) ──────────────────────────
//
// Not a signal block. Two of these reach the sound through other blocks rather than
// on their own: `key` resolves HARMONIST_HR's diatonic scale degrees to semitones, and
// `bpm` is the tempo every note-valued control plays against, so a delay set to 1/4
// means nothing without it.

const PATCH_SETTING_FIELDS: FieldCodec[] = [
  nibblePair("memoryLevel", 0),
  nibblePair("bpm", 2),
  lookup("key", 4, KEY_NAMES),
  bool("carryover", 5),
  bool("tempoHold", 6),
];

/**
 * `decodeFields` answers the union any field codec can produce, and these five are the only decoded
 * values a consumer meets without a block around them, so each is narrowed back to its own type
 * here rather than leaving the patch's tempo typed as "string or number or boolean".
 */
const decodeSettings = (hexList: string[]): PatchSettings => {
  const decoded = decodeFields(PATCH_SETTING_FIELDS, bytesFromHex(hexList));
  return {
    memoryLevel: Number(decoded.memoryLevel),
    bpm:         Number(decoded.bpm),
    key:         String(decoded.key),
    carryover:   Boolean(decoded.carryover),
    tempoHold:   Boolean(decoded.tempoHold),
  };
};

const encodeSettings = (settings: PatchSettings, originalHex: string[]): string[] => {
  const bytes = bytesFromHex(originalHex);
  encodeFields(PATCH_SETTING_FIELDS, { ...settings }, bytes);
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


// ── Single-shape blocks: AMP, OD/DS, NS, FV ───────────────────────────────────
//
// Each holds one fixed set of controls whatever else the patch does. Bytes before the first
// control are the block's own on/type selectors, read and written by the decoders below.
//
// AMP:   [on, type, type_bass, gain, level, bass, middle, treble, speaker, sp_type_bass, mic, solo,
//         soloLevel]. Bytes 2 and 9 are the bass-mode mirrors of type and speaker, out of scope in
//         guitar mode, the same pattern as FX_COM's byte 2.
// OD/DS: [on, type, drive, tone, level, direct, solo, soloLevel]
// NS:    [on, threshold, release, detect]
// FV:    [position, min, max, curve]; no on/off byte, since the block is always in the signal.

const AMP_FIELDS: FieldCodec[] = [
  u8("gain", 3), u8("level", 4), u8("bass", 5), u8("middle", 6), u8("treble", 7),
  lookup("speaker", 8, SP_TYPES), lookup("mic", 10, MIC_TYPES), bool("solo", 11), u8("soloLevel", 12),
];

const DRIVE_FIELDS: FieldCodec[] = [
  u8("drive", 2), signed("tone", 3), u8("level", 4), u8("direct", 5), bool("solo", 6), u8("soloLevel", 7),
];

const NOISE_GATE_FIELDS: FieldCodec[] = [
  u8("threshold", 1), u8("release", 2), lookup("detect", 3, NS_DETECT),
];

/** The FV byte holding the curve, which a 3-byte FV block has no room for. */
const CURVE_BYTE = 3;

const VOLUME_FIELDS: FieldCodec[] = [
  u8("position", 0), u8("min", 1), u8("max", 2), lookup("curve", CURVE_BYTE, FV_CURVE),
];

/** The curve a 3-byte FV block plays with, having no byte to store another. */
const DEFAULT_CURVE = "NORMAL";

/** The FV fields a block of this length can store: all of them, or all but the curve. */
const volumeFieldsIn = (bytes: number[]): FieldCodec[] =>
  bytes.length > CURVE_BYTE ? VOLUME_FIELDS : VOLUME_FIELDS.filter(field => field.name !== "curve");

const decodeNoiseGate = (hexList: string[]): NoiseGateBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, "NS");
  const params = decodeFields(NOISE_GATE_FIELDS, bytes) as NoiseGateParams;
  return { on: Boolean(at(0)), params, [RAW]: bytes };
};

const encodeNoiseGate = (block: NoiseGateBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  encodeFields(NOISE_GATE_FIELDS, block.params, bytes);
  return hexFromBytes(bytes);
};

const decodeVolume = (hexList: string[]): VolumeBlock => {
  const bytes = bytesFromHex(hexList);
  const decoded = decodeFields(volumeFieldsIn(bytes), bytes);
  const params = { ...decoded, curve: decoded.curve ?? DEFAULT_CURVE } as VolumeParams;
  return { params, [RAW]: bytes };
};

const encodeVolume = (block: VolumeBlock): string[] => {
  const bytes = [...block[RAW]];
  encodeFields(volumeFieldsIn(bytes), block.params, bytes);
  return hexFromBytes(bytes);
};


// ── FX_COM block (on/type header + bass-mode type mirror, 3 bytes) ────────────
//
// Byte 2 is the bass-mode mirror of byte 1's type selector and never carries a subtype for any
// effect. An effect with its own sub-model stores it in the FX param block itself (see
// PARAM_SUBTYPE_EFFECTS in model/constants.ts), not here. Out of scope in guitar mode, so
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
// Bytes 0–1 of the full block are [on, type], handled by decodeTypedBlock/encodeTypedBlock.
// All other offsets below are absolute byte positions within the full block.
//
// Many fields are shared across types at the same address (e.g. feedback/level/highCut
// at 6/7/8 for every "clean" delay type, or trigger/level at 21/25 shared by WARP,
// TWIST, and GLITCH) rather than each type getting its own compact, contiguous layout.

const DELAY_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "STANDARD": [
    syncedTime("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
  ],
  "MODULATE": [
    syncedTime("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    u8("modRate", 9), u8("modDepth", 10),
  ],
  "PAN": [
    syncedTime("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    u8("tapTime", 11),
  ],
  "REVERSE": [
    syncedTime("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    bool("trigger", 12),
  ],
  "ANALOG": [
    // The one delay time with its own address and its own ceiling; every other type shares byte 2.
    namedAbove(nibbleQuad("time", 13), 1200, TIME_NOTE_VALUES),
    u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
  ],
  "ANLG MOD": [
    syncedTime("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    u8("modRate", 9), u8("modDepth", 10),
  ],
  "SPACE ECHO": [
    syncedTime("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    lookup("head", 17, SPACE_ECHO_HEAD),
  ],
  "SHIMMER": [
    syncedTime("time", 2), u8("feedback", 6), u8("level", 7), lookup("highCut", 8, FREQ_HIGH_CUT),
    signed("pitch", 18, 24), u8("balance", 19),
  ],
  "WARP": [
    syncedTime("time", 2), bool("trigger", 21), u8("level", 25),
  ],
  "TWIST": [
    lookup("mode", 20, TWIST_MODES), bool("trigger", 21),
    u8("riseTime", 22), u8("fallTime", 23), u8("fadeTime", 24), u8("level", 25),
  ],
  "GLITCH": [
    bool("trigger", 21), u8("time", 26), u8("glitch", 27), u8("balance", 28),
  ],
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
    syncedTime("time", 11), u8("level", 15), u8("feedback", 16), lookup("highCut", 17, FREQ_HIGH_CUT),
  ],
  "TERA ECHO": [
    signed("tone", 3, 50), u8("level", 5), u8("direct", 8),
    u8("feedback", 16), u8("spreadTime", 18), bool("trigger", 19),
  ],
};

// ── PFX (expression pedal effect: WAH / PEDAL BEND) block (14 bytes) ──────────
//
// Byte 3 is the bass-mode mirror of byte 2's wah model, out of scope in guitar mode, same
// pattern as AMP/FX_COM's other bass-mode mirror bytes. Both WAH's and
// PEDAL BEND's fields always occupy their fixed byte ranges regardless of which is
// currently selected (the same "shadow bytes" union layout as delay/reverb).

const PFX_TYPE_MAPS: Partial<Record<string, FieldCodec[]>> = {
  "WAH": [
    lookup(SUB_TYPE_FIELD, 2, WAH_TYPES), u8("level", 4), u8("direct", 5),
    u8("position", 6), u8("min", 7), u8("max", 8),
  ],
  "PEDAL BEND": [
    signed("pitchMin", 9, 24), signed("pitchMax", 10, 24),
    u8("position", 11), u8("level", 12), u8("direct", 13),
  ],
};

// ── Blocks selected by a type byte ────────────────────────────────────────────
//
// AMP, OD/DS, DLY, REV and PFX share one layout: byte 0 is on/off, byte 1 indexes the block's type
// table, and the rest are the fields the codec keeps for that type. They differ only in the table
// and the field lists, so one table entry per block says what the two functions below need.

/** What one type-selected block's bytes mean: its type table and the fields each type keeps. */
interface TypedBlockCodec {
  /** The device's own name for the block, which a rejected byte or type is reported under. */
  label: string;
  types: readonly string[];
  typeIndex: Record<string, number>;
  /** Undefined for a type the codec has no field list for, whose bytes pass through untouched. */
  fieldsFor: (type: string) => FieldCodec[] | undefined;
}

const TYPED_BLOCKS = {
  amp:     { label: "AMP",   types: AMP_TYPES,  typeIndex: AMP_TYPE_IDX, fieldsFor: () => AMP_FIELDS },
  drive:   { label: "OD/DS", types: ODDS_TYPES, typeIndex: ODDS_IDX,     fieldsFor: () => DRIVE_FIELDS },
  delay:   { label: "DLY",   types: DLY_TYPES,  typeIndex: DLY_TYPE_IDX, fieldsFor: (type: string) => DELAY_TYPE_MAPS[type] },
  reverb:  { label: "REV",   types: REV_TYPES,  typeIndex: REV_TYPE_IDX, fieldsFor: reverbFields },
  pedalFx: { label: "PFX",   types: PFX_TYPES,  typeIndex: PFX_TYPE_IDX, fieldsFor: (type: string) => PFX_TYPE_MAPS[type] },
} satisfies Record<string, TypedBlockCodec>;

type TypedBlockName = keyof typeof TYPED_BLOCKS;

/** A type-selected block as its bytes read, before any block narrows what its params hold. */
interface TypedBlock {
  on: boolean;
  type: string;
  params: BlockParams;
  [RAW]: number[];
}

// Each block's decoded params are what its field list decodes to: the drift guards pin every list
// to the block's catalog params, which the block types mirror, so a caller may narrow the result.
const decodeTypedBlock = (codec: TypedBlockCodec, hexList: string[]): TypedBlock => {
  const bytes = bytesFromHex(hexList);
  const at = byteReader(bytes, codec.label);
  const type = lookupName(codec.types, at(1));
  const fields = codec.fieldsFor(type);
  const params = fields === undefined ? {} : decodeFields(fields, bytes);
  return { on: Boolean(at(0)), type, params, [RAW]: bytes };
};

const encodeTypedBlock = (codec: TypedBlockCodec, block: TypedBlock): string[] => {
  const bytes = [...block[RAW]];
  bytes[0] = Number(block.on);
  bytes[1] = lookupIndex(codec.typeIndex, block.type, `${codec.label} type`);
  const fields = codec.fieldsFor(block.type);
  if (fields) encodeFields(fields, block.params, bytes);
  return hexFromBytes(bytes);
};

/** PFX keeps the wah model among its params' bytes; the decoded block carries it as `subType`. */
const decodePedalFx = (hexList: string[]): PedalFxBlock => {
  const block = decodeTypedBlock(TYPED_BLOCKS.pedalFx, hexList);
  const { subType, params } = liftSubType(block.params);
  return { ...block, subType, params };
};

const encodePedalFx = (block: PedalFxBlock): string[] =>
  encodeTypedBlock(TYPED_BLOCKS.pedalFx, { ...block, params: withStoredSubType(block.params, block.subType) });

// ── Field lists by block ──────────────────────────────────────────────────────

const SINGLE_SHAPE_FIELDS: Partial<Record<string, FieldCodec[]>> = {
  noiseGate: NOISE_GATE_FIELDS, volume: VOLUME_FIELDS,
};

const isTypedBlock = (group: string): group is TypedBlockName => group in TYPED_BLOCKS;

/**
 * The field list a block's params are read and written through, by capability group id: the
 * block's one list, or the list for the type it is set to (and for an fx slot's DELAY, its
 * sub-algorithm). Undefined where the codec has no list for that selection.
 */
const fieldsFor = (group: string, type = "", subType: string | null = null): FieldCodec[] | undefined => {
  if (group === "fx") return fxFieldsFor(type, subType ?? "");
  if (isTypedBlock(group)) return TYPED_BLOCKS[group].fieldsFor(type);
  return SINGLE_SHAPE_FIELDS[group];
};

export {
  fieldsFor,
  decodeName, encodeName,
  decodeSettings, encodeSettings, PATCH_SETTING_FIELDS,
  decodeChain, encodeChain, validateChain,
  TYPED_BLOCKS, decodeTypedBlock, encodeTypedBlock,
  decodeNoiseGate, encodeNoiseGate,
  decodeVolume, encodeVolume,
  decodeFxCom, encodeFxCom,
  decodePedalFx, encodePedalFx,
  DELAY_TYPE_MAPS, REV_TYPE_MAPS, STANDARD_REVERB_TYPES, PFX_TYPE_MAPS,
};
export type { TypedBlock, TypedBlockCodec };
