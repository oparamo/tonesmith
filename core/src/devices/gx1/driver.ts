import type { FieldEdit, FieldEdits, PatchView, RawPatch, PatchDriver } from "../../types";
import type { Patch, PatchFile, RawParamSet } from "./types";
import { decodePatch as codecDecodePatch, encodePatch as codecEncodePatch } from "./codec";
import {
  blankPatch as tslBlankPatch,
  newFile as tslNewFile,
  parseFile as tslParseFile,
  serializeFile as tslSerializeFile,
} from "./tsl";
import { gx1Capabilities } from "./capabilities";
import { buildPatch as specBuildPatch, applyEdits as specApplyEdits } from "./spec";
import { viewPatch as buildPatchView } from "./view";

// Arrow wrappers pair the PatchDriver contract with the concrete GX-1 file type, keeping the driver
// fully typed without widening the file I/O functions underneath it.
const driver: PatchDriver<Patch> = {
  id:           "gx1",
  name:         "BOSS GX-1",
  capabilities: gx1Capabilities,

  parseFile: (bytes: Uint8Array, source: string): PatchFile =>
    tslParseFile(bytes, source),

  serializeFile: (file): Uint8Array =>
    tslSerializeFile(file),

  newFile: (setName: string, patchCount?: number): PatchFile =>
    tslNewFile(setName, patchCount),

  blankPatch: (name?: string): Patch =>
    tslBlankPatch(name),

  buildPatch: (spec: unknown): Patch =>
    specBuildPatch(spec),

  applyEdits: (patch: Patch, edits: readonly FieldEdit[]): FieldEdits =>
    specApplyEdits(patch, edits),

  viewPatch: (patch: Patch): PatchView =>
    buildPatchView(patch),

  decodePatch: (raw: RawPatch): Patch =>
    codecDecodePatch(raw as { memo?: string; paramSet: RawParamSet }),

  encodePatch: (patch: Patch): RawPatch =>
    codecEncodePatch(patch),
};

export { driver };
