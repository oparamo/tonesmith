import { readFileSync } from "node:fs";
import { writeFileAtomic } from "../../atomic-write";
import { decodePatch, encodePatch, hexFromBytes } from "./codec";
import { encodeName } from "./codec/blocks";
import { RAW, NAME_BYTES } from "./common";
import type { PatchFile as BasePatchFile } from "../../types";
import type { Patch, PatchFile, RawParamSet, TslEnvelope } from "./types";

/** Byte length of each block that opens zero-filled. */
const BLOCK_BYTES = {
  fxCom: 3,
  fxParams: 251,
  fx3a: 5,
  delay: 29,
  reverb: 20,
  pfx: 14,
} as const;

const ASSIGN_SLOTS = 8;

/** Patch names sit space-padded to the full block. */
const NAME_PAD = 0x20;

/**
 * PFX, FX1, OD/DS, AMP, NS, FV, FX2, FX3, DLY, REV, OUTPUT as a MEMORY%CHAIN linked list (see
 * CHAIN_BLOCK_ORDER in common/constants.ts): byte 0 is PFX, the first block; each later byte is
 * the firmware value of whatever follows that fixed block.
 */
const DEFAULT_CHAIN_BYTES = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 11, 12];

// The blocks whose bytes are one fixed shape, so a blank patch can carry the device's own factory
// values for them outright. Each array is `default-init.tsl`'s bytes for that block, which agree
// with the device's official parameter table field for field. The rest open zero-filled: their
// bytes mean different things per type, so there is no one value to open at, and the builder fills
// each type's own defaults from DEFAULTS_BY_TYPE instead.

/** Off, NATURAL, gain 50, level 50, bass/mid/treble 50, ORIGINAL speaker, DYN421 mic, solo off at 50. */
const AMP_DEFAULT_BYTES = [0, 1, 0, 50, 50, 50, 50, 50, 1, 1, 1, 0, 50];

/** Off, OVERDRIVE, drive 50, tone 0 (stored +50), level 50, direct 0, solo off at 50. */
const ODDS_DEFAULT_BYTES = [0, 6, 50, 50, 50, 0, 0, 50];

/** Position 100, min 0, max 100, NORMAL curve. */
const FV_DEFAULT_BYTES = [100, 0, 100, 2];

/** Off, threshold 30, release 30, INPUT detect. */
const NS_DEFAULT_BYTES = [0, 30, 30, 0];

/**
 * Memory level 100 and BPM 120, each a byte split across two nibbles, then key of C, carryover on,
 * tempo hold off. Zeros are a setting rather than an absence here: they trim the patch's output to
 * silence and put the tempo below the 40 the device accepts.
 */
const OTHER_DEFAULT_BYTES = [6, 4, 7, 8, 0, 1, 0];

/**
 * The footswitch assignments the device ships a patch with, a function index and a mode per switch.
 * FORMAT.md documents the shape and leaves the block undecoded, so these are the fixture's bytes
 * rather than a field-by-field reading of them.
 */
const CTL_DEFAULT_BYTES = [
  1, 0, 2, 0, 3, 0, 0, 0, 0, 0, 5, 0, 5, 2, 5, 0,
  17, 0, 4, 0, 3, 17, 0, 4, 0, 7, 0, 16, 0, 11, 0, 3,
];

/** An assign slot at rest. Undecoded like MEMORY%CTL, so this is the fixture's bytes as they are. */
const ASSIGN_DEFAULT_BYTES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

// A fresh array per call: RAW is a public escape hatch, and callers are free to mutate
// patch[RAW]["MEMORY%FXn"] in place (e.g. to probe undecoded byte offsets). A shared array would
// let a mutation on one FX slot silently corrupt the blank template for every other slot and
// every later blankPatch() call.
const zeroBytes = (count: number): string[] => hexFromBytes(new Array<number>(count).fill(0));

const blankParamSet = (): RawParamSet => {
  const paramSet: RawParamSet = {
    "MEMORY%COM":     hexFromBytes(new Array<number>(NAME_BYTES).fill(NAME_PAD)),
    "MEMORY%CHAIN":   hexFromBytes(DEFAULT_CHAIN_BYTES),
    "MEMORY%FX1_COM": zeroBytes(BLOCK_BYTES.fxCom),
    "MEMORY%FX1":     zeroBytes(BLOCK_BYTES.fxParams),
    "MEMORY%FX2_COM": zeroBytes(BLOCK_BYTES.fxCom),
    "MEMORY%FX2":     zeroBytes(BLOCK_BYTES.fxParams),
    "MEMORY%FX3_COM": zeroBytes(BLOCK_BYTES.fxCom),
    "MEMORY%FX3":     zeroBytes(BLOCK_BYTES.fxParams),
    "MEMORY%FX3A":    zeroBytes(BLOCK_BYTES.fx3a),
    "MEMORY%ODDS":    hexFromBytes(ODDS_DEFAULT_BYTES),
    "MEMORY%AMP":     hexFromBytes(AMP_DEFAULT_BYTES),
    "MEMORY%DLY":     zeroBytes(BLOCK_BYTES.delay),
    "MEMORY%REV":     zeroBytes(BLOCK_BYTES.reverb),
    "MEMORY%PFX":     zeroBytes(BLOCK_BYTES.pfx),
    "MEMORY%FV":      hexFromBytes(FV_DEFAULT_BYTES),
    "MEMORY%NS":      hexFromBytes(NS_DEFAULT_BYTES),
    "MEMORY%OTHER":   hexFromBytes(OTHER_DEFAULT_BYTES),
    "MEMORY%CTL":     hexFromBytes(CTL_DEFAULT_BYTES),
  };
  for (let slot = 1; slot <= ASSIGN_SLOTS; slot++) {
    paramSet[`MEMORY%ASGN${slot}`] = hexFromBytes(ASSIGN_DEFAULT_BYTES);
  }
  return paramSet;
};

const blankPatch = (name = "NEW PATCH"): Patch => {
  const paramSet = blankParamSet();
  paramSet["MEMORY%COM"] = encodeName(name);
  return decodePatch({ memo: "", paramSet });
};

/** The `device` field of the file format itself: what this driver writes, and the only one it reads. */
const FILE_DEVICE = "GX-1";

/** This driver's id in the registry, which is what a decoded file names as its device. */
const DRIVER_ID = "gx1";

const FORMAT_REV = "0000";

const newFile = (setName: string, patchCount = 1): PatchFile => {
  const patches = Array.from({ length: patchCount }, () => blankPatch());
  const envelope: TslEnvelope = { name: setName, formatRev: FORMAT_REV, device: FILE_DEVICE, data: [[], []] };
  return { name: setName, formatRev: FORMAT_REV, device: DRIVER_ID, patches, [RAW]: envelope };
};

/**
 * Every block a patch has to carry, read off the blank patch so the list cannot fall behind the
 * codec: a block the codec learns to write is a block a file has to hold.
 */
const REQUIRED_BLOCKS = Object.keys(blankParamSet());

const isHexList = (value: unknown): boolean =>
  Array.isArray(value) && value.every(entry => typeof entry === "string");

const paramSetOf = (patch: unknown): Record<string, unknown> | undefined => {
  if (patch === null || typeof patch !== "object") return undefined;
  const { paramSet } = patch as { paramSet?: unknown };
  if (paramSet === null || typeof paramSet !== "object") return undefined;
  return paramSet as Record<string, unknown>;
};

const checkPatch = (path: string, index: number, patch: unknown): void => {
  const paramSet = paramSetOf(patch);
  if (paramSet === undefined) {
    throw new Error(`Cannot read ${path}: patch ${index} carries no paramSet.`);
  }
  const missing = REQUIRED_BLOCKS.filter(block => !isHexList(paramSet[block]));
  if (missing.length > 0) {
    throw new Error(`Cannot read ${path}: patch ${index} is missing ${missing.join(", ")}.`);
  }
};

/**
 * Narrows what `JSON.parse` handed back to an envelope this device wrote. Anything at all can be
 * pointed at a tool that takes a path, and without this the first field the codec reached for threw
 * a TypeError naming neither the file nor what was wrong with it.
 */
const parseEnvelope = (path: string, parsed: unknown): TslEnvelope => {
  const envelope = (parsed ?? {}) as Partial<TslEnvelope>;
  if (typeof envelope !== "object" || typeof envelope.device !== "string") {
    throw new Error(`Cannot read ${path}: it is not a patch file.`);
  }
  if (envelope.device !== FILE_DEVICE) {
    throw new Error(`Cannot read ${path}: it holds a ${envelope.device} patch set, not a ${FILE_DEVICE} one.`);
  }
  if (!Array.isArray(envelope.data) || !Array.isArray(envelope.data[0])) {
    throw new Error(`Cannot read ${path}: its "data" field holds no list of patches.`);
  }
  envelope.data[0].forEach((patch, index) => { checkPatch(path, index, patch); });
  return envelope as TslEnvelope;
};

const readFile = (path: string): PatchFile => {
  const envelope = parseEnvelope(path, JSON.parse(readFileSync(path, "utf8")));
  return {
    name:      envelope.name,
    formatRev: envelope.formatRev,
    device:    DRIVER_ID,
    patches:   envelope.data[0].map(decodePatch),
    [RAW]: envelope,
  };
};

/**
 * The device-agnostic `PatchFile` a caller may hand `PatchDriver.writeFile` is not one this writer
 * can start from. Every write begins at the envelope the file was read as and overwrites the byte
 * indices this codec knows, which is what leaves the format's undecoded fields intact, so a file
 * assembled by hand has nothing to write back.
 */
const asWritable = (file: BasePatchFile<Patch>, path: string): PatchFile => {
  const candidate = file as Partial<PatchFile>;
  if (candidate[RAW] === undefined || candidate.formatRev === undefined) {
    throw new Error(`Cannot write ${path}: this patch file did not come from readFile or newFile, so it carries none of the original bytes a write starts from.`);
  }
  return file as PatchFile;
};

const writeFile = (input: BasePatchFile<Patch>, path: string): void => {
  const file = asWritable(input, path);
  const envelope: TslEnvelope = {
    ...file[RAW],
    name:      file.name,
    formatRev: file.formatRev,
    data: [file.patches.map(encodePatch), file[RAW].data[1]],
  };
  writeFileAtomic(path, JSON.stringify(envelope));
};

export { blankPatch, newFile, readFile, writeFile };
