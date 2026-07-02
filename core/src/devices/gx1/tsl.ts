import { readFileSync, writeFileSync } from "node:fs";
import { decodePatch, encodePatch, hexFromBytes } from "./codec";
import { encodeName } from "./codec/blocks";
import { RAW } from "./common";
import type { Patch, PatchFile, RawParamSet, TslEnvelope } from "./types";

// A fresh zero-filled array per call -- RAW is a public escape hatch, and callers
// are free to mutate patch[RAW]["MEMORY%FXn"] in place (e.g. to probe undecoded byte
// offsets). A single shared array here would let a mutation on one FX slot silently
// corrupt the "blank" template for every other slot and every later blankPatch() call.
const zeros251 = (): string[] => hexFromBytes(new Array(251).fill(0));

const blankParamSet = (): RawParamSet => {
  // PFX->FX1->OD/DS->AMP->NS->FV->FX2->FX3->DLY->REV->OUTPUT as a MEMORY%CHAIN linked
  // list (see CHAIN_BLOCK_ORDER in common/constants.ts): byte 0 is PFX (first block);
  // each subsequent byte is the firmware value of what follows that fixed block.
  const defaultChain = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 11, 12];
  const ps: RawParamSet = {
    "MEMORY%COM":     hexFromBytes(new Array(16).fill(0x20)),
    "MEMORY%CHAIN":   hexFromBytes(defaultChain),
    "MEMORY%FX1_COM": hexFromBytes([0, 0, 0]),
    "MEMORY%FX1":     zeros251(),
    "MEMORY%FX2_COM": hexFromBytes([0, 0, 0]),
    "MEMORY%FX2":     zeros251(),
    "MEMORY%FX3_COM": hexFromBytes([0, 0, 0]),
    "MEMORY%FX3":     zeros251(),
    "MEMORY%FX3A":    hexFromBytes(new Array(5).fill(0)),
    "MEMORY%ODDS":    hexFromBytes(new Array(8).fill(0)),
    // on=1, type=TRNSPRNT(0), type_bass=0, gain=50, level=100, bass=50, mid=50, treble=50,
    // speaker=ORIGINAL(1), sp_type_bass=0, mic=DYN57(0), solo=0, soloLevel=0
    "MEMORY%AMP":     hexFromBytes([1, 0, 0, 50, 100, 50, 50, 50, 1, 0, 0, 0, 0]),
    "MEMORY%DLY":     hexFromBytes(new Array(29).fill(0)),
    "MEMORY%REV":     hexFromBytes(new Array(20).fill(0)),
    // off, type=WAH(0)
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
      file.patches.map(patch => encodePatch(patch) as unknown as RawParamSet),
      file[RAW].data[1],
    ],
  };
  writeFileSync(path, JSON.stringify(envelope, null, 4));
};

export { blankPatch, newFile, readFile, writeFile };
