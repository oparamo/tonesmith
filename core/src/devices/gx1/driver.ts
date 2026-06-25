import type { RawPatch, PatchDriver } from "../../types/index";
import type { Patch, PatchFile, RawParamSet } from "./types/index";
import { decodePatch as codecDecodePatch, encodePatch as codecEncodePatch } from "./codec/index";
import {
  blankPatch as tslBlankPatch,
  newFile as tslNewFile,
  readFile as tslReadFile,
  writeFile as tslWriteFile,
} from "./tsl";
import { gx1Capabilities } from "./capabilities";

// Arrow wrappers narrow the PatchDriver contract to the concrete GX-1 file type,
// keeping the driver fully typed without widening the concrete file I/O functions.
const driver: PatchDriver<Patch> = {
  id:           "gx1",
  name:         "BOSS GX-1",
  capabilities: gx1Capabilities,

  readFile:  (path: string): PatchFile =>
    tslReadFile(path),

  writeFile: (file, path): void =>
    tslWriteFile(file as PatchFile, path),

  newFile: (setName: string, nPatches?: number): PatchFile =>
    tslNewFile(setName, nPatches),

  blankPatch: (name?: string): Patch =>
    tslBlankPatch(name),

  decodePatch: (raw: RawPatch): Patch =>
    codecDecodePatch(raw as { memo?: string; paramSet: RawParamSet }),

  encodePatch: (patch: Patch): RawPatch =>
    codecEncodePatch(patch) as RawPatch,
};

export { driver };
