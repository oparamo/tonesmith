import type { PatchDriver } from "../../model";
import type { Patch } from "./model";
import { DRIVER_ID, newFile, parseFile, serializeFile } from "./format/tsl";
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
  buildPatch,
  applyEdits,
  viewPatch,
};

export { driver };
