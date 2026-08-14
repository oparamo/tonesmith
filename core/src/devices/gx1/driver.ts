import type { RawPatch, PatchDriver } from "../../types";
import type { Patch, PatchFile, RawParamSet } from "./types";
import { decodePatch as codecDecodePatch, encodePatch as codecEncodePatch } from "./codec";
import {
  blankPatch as tslBlankPatch,
  newFile as tslNewFile,
  readFile as tslReadFile,
  writeFile as tslWriteFile,
} from "./tsl";
import { gx1Capabilities } from "./capabilities";
import { buildPatch as specBuildPatch, validateFieldEdits } from "./spec";

// Arrow wrappers pair the PatchDriver contract with the concrete GX-1 file type, keeping the driver
// fully typed without widening the file I/O functions underneath it.
const driver: PatchDriver<Patch> = {
  id:           "gx1",
  name:         "BOSS GX-1",
  capabilities: gx1Capabilities,

  readFile:  (path: string): PatchFile =>
    tslReadFile(path),

  writeFile: (file, path): void =>
    { tslWriteFile(file, path); },

  newFile: (setName: string, patchCount?: number): PatchFile =>
    tslNewFile(setName, patchCount),

  blankPatch: (name?: string): Patch =>
    tslBlankPatch(name),

  buildPatch: (spec: unknown): Patch =>
    specBuildPatch(spec),

  validateFields: (patch: Patch, edits: Record<string, unknown>): string[] =>
    validateFieldEdits(patch, edits),

  decodePatch: (raw: RawPatch): Patch =>
    codecDecodePatch(raw as { memo?: string; paramSet: RawParamSet }),

  encodePatch: (patch: Patch): RawPatch =>
    codecEncodePatch(patch),
};

export { driver };
