import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { decodePatch, encodePatch, hexFromBytes } from "./codec";
import { encodeName } from "./codec/blocks";
import { RAW, NAME_BYTES } from "./common";
import type { Patch, PatchFile, RawParamSet, TslEnvelope } from "./types";

/** Byte length of each block that opens zero-filled. */
const BLOCK_BYTES = {
  fxCom: 3,
  fxParams: 251,
  fx3a: 5,
  delay: 29,
  reverb: 20,
  pfx: 14,
  other: 7,
  ctl: 32,
  assign: 15,
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

// The four blocks whose bytes are one fixed shape, so a blank patch can carry the device's own
// factory values for them outright. Each array is `default-init.tsl`'s bytes for that block, which
// agree with the device's official parameter table field for field. The other blocks open
// zero-filled: their bytes mean different things per type, so there is no one value to open at, and
// the builder fills each type's own defaults from DEFAULTS_BY_TYPE instead.

/** Off, NATURAL, gain 50, level 50, bass/mid/treble 50, ORIGINAL speaker, DYN421 mic, solo off at 50. */
const AMP_DEFAULT_BYTES = [0, 1, 0, 50, 50, 50, 50, 50, 1, 1, 1, 0, 50];

/** Off, OVERDRIVE, drive 50, tone 0 (stored +50), level 50, direct 0, solo off at 50. */
const ODDS_DEFAULT_BYTES = [0, 6, 50, 50, 50, 0, 0, 50];

/** Position 100, min 0, max 100, NORMAL curve. */
const FV_DEFAULT_BYTES = [100, 0, 100, 2];

/** Off, threshold 30, release 30, INPUT detect. */
const NS_DEFAULT_BYTES = [0, 30, 30, 0];

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
    "MEMORY%OTHER":   zeroBytes(BLOCK_BYTES.other),
    "MEMORY%CTL":     zeroBytes(BLOCK_BYTES.ctl),
  };
  for (let slot = 1; slot <= ASSIGN_SLOTS; slot++) {
    paramSet[`MEMORY%ASGN${slot}`] = zeroBytes(BLOCK_BYTES.assign);
  }
  return paramSet;
};

const blankPatch = (name = "NEW PATCH"): Patch => {
  const paramSet = blankParamSet();
  paramSet["MEMORY%COM"] = encodeName(name);
  return decodePatch({ memo: "", paramSet });
};

const newFile = (setName: string, patchCount = 1): PatchFile => {
  const patches = Array.from({ length: patchCount }, () => blankPatch());
  const envelope: TslEnvelope = { name: setName, formatRev: "0000", device: "GX-1", data: [[], []] };
  return { name: setName, formatRev: "0000", device: "GX-1", patches, [RAW]: envelope };
};

const readFile = (path: string): PatchFile => {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as TslEnvelope;
  return {
    name:      envelope.name,
    formatRev: envelope.formatRev,
    device:    envelope.device,
    patches:   envelope.data[0].map(rawPatch =>
      decodePatch(rawPatch as unknown as { memo?: string; paramSet: RawParamSet })
    ),
    [RAW]: envelope,
  };
};

const writeFile = (file: PatchFile, path: string): void => {
  const envelope: TslEnvelope = {
    ...file[RAW],
    name:      file.name,
    formatRev: file.formatRev,
    data: [
      file.patches.map(patch => encodePatch(patch) as unknown as RawParamSet),
      file[RAW].data[1],
    ],
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(envelope));
};

export { blankPatch, newFile, readFile, writeFile };
