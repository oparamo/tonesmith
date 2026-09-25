import type { RawPatch, PatchDriver } from "../../model";
import type { Patch, RawParamSet } from "./model";
import { decodePatch, encodePatch } from "./format/codec";
import { DRIVER_ID, blankPatch, newFile, parseFile, serializeFile } from "./format/tsl";
import { gx1Capabilities } from "./catalog/capabilities";
import { buildPatch, applyEdits } from "./spec";
import { viewPatch } from "./view";

const driver: PatchDriver<Patch> = {
  id:           DRIVER_ID,
  name:         "BOSS GX-1",
  capabilities: gx1Capabilities,
  parseFile,
  serializeFile,
  newFile,
  blankPatch,
  buildPatch,
  applyEdits,
  viewPatch,
  // The interface hands over any raw patch; the codec reads the envelope shape `parseFile` checks.
  decodePatch: (raw: RawPatch): Patch => decodePatch(raw as { memo?: string; paramSet: RawParamSet }),
  encodePatch,
};

export { driver };
