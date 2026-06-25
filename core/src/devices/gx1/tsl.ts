import { readFileSync, writeFileSync } from "node:fs";
import { decodePatch, encodePatch, hexFromBytes } from "./codec/index";
import { encodeName } from "./codec/blocks";
import { RAW } from "./common/index";
import type { Patch, PatchFile, RawParamSet, TslEnvelope } from "./types/index";

const ZEROS_251 = hexFromBytes(new Array(251).fill(0));

const blankParamSet = (): RawParamSet => {
  const defaultChain = [1, 2, 3, 7, 8, 6, 9, 4, 5, 10, 0, 11, 12];
  const ps: RawParamSet = {
    "MEMORY%COM":     hexFromBytes(new Array(16).fill(0x20)),
    "MEMORY%CHAIN":   hexFromBytes(defaultChain),
    "MEMORY%FX1_COM": hexFromBytes([0, 0, 0]),
    "MEMORY%FX1":     ZEROS_251,
    "MEMORY%FX2_COM": hexFromBytes([0, 0, 0]),
    "MEMORY%FX2":     ZEROS_251,
    "MEMORY%FX3_COM": hexFromBytes([0, 0, 0]),
    "MEMORY%FX3":     ZEROS_251,
    "MEMORY%FX3A":    hexFromBytes(new Array(5).fill(0)),
    "MEMORY%ODDS":    hexFromBytes(new Array(8).fill(0)),
    // on=1, type=TRNSPRNT(0), unused=0, gain=50, level=100, bass=50, mid=50, treble=50,
    // speaker=ORIGINAL(1), unused=0, mic=DYN57(0), unused=0, unused=0
    "MEMORY%AMP":     hexFromBytes([1, 0, 0, 50, 100, 50, 50, 50, 1, 0, 0, 0, 0]),
    "MEMORY%DLY":     hexFromBytes(new Array(29).fill(0)),
    "MEMORY%REV":     hexFromBytes(new Array(20).fill(0)),
    "MEMORY%PFX":     hexFromBytes(new Array(14).fill(0)),
    // position=100, min=0, max=100, curve=NORMAL(2)
    "MEMORY%FV":      hexFromBytes([100, 0, 100, 2]),
    // off, threshold=20, release=20, detect=INPUT(0)
    "MEMORY%NS":      hexFromBytes([0, 20, 20, 0]),
    "MEMORY%OTHER":   hexFromBytes(new Array(7).fill(0)),
    "MEMORY%CTL":     hexFromBytes(new Array(32).fill(0)),
  };
  for (let i = 1; i <= 8; i++) {
    ps[`MEMORY%ASGN${i}`] = hexFromBytes(new Array(15).fill(0));
  }
  return ps;
};

const blankPatch = (name = "NEW PATCH"): Patch => {
  const ps = blankParamSet();
  ps["MEMORY%COM"] = encodeName(name);
  return decodePatch({ memo: "", paramSet: ps });
};

const newFile = (setName: string, nPatches = 1): PatchFile => {
  const patches = Array.from({ length: nPatches }, () => blankPatch());
  const envelope: TslEnvelope = { name: setName, formatRev: "0000", device: "GX-1", data: [[], []] };
  return { name: setName, formatRev: "0000", device: "GX-1", patches, [RAW]: envelope };
};

const readFile = (path: string): PatchFile => {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as TslEnvelope;
  return {
    name:      envelope.name,
    formatRev: envelope.formatRev,
    device:    envelope.device,
    patches:   envelope.data[0].map(r =>
      decodePatch(r as unknown as { memo?: string; paramSet: RawParamSet })
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
      file.patches.map(p => encodePatch(p) as unknown as RawParamSet),
      file[RAW].data[1],
    ],
  };
  writeFileSync(path, JSON.stringify(envelope, null, 4));
};

export { blankPatch, newFile, readFile, writeFile };
