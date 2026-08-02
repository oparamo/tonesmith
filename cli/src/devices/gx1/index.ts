import type { PatchDriver, gx1 } from "@tonesmith/core";
import type { CliDescriptor } from "../../types";
import { configureDeviceCommands } from "../../common";
import { printPatch } from "./print";

const gx1Cli: CliDescriptor = {
  id: "gx1",
  description: "BOSS GX-1",
  // The id ↔ patch-type pairing ("gx1" always yields a PatchDriver<gx1.Patch>) is a fact the
  // roster's device-agnostic CliDescriptor type can't express. Asserting it is safe here
  // because this module is gx1-owned code, not the generic dispatcher.
  configure: (cmd, driver) => { configureDeviceCommands(cmd, driver as PatchDriver<gx1.Patch>, printPatch); },
};

export { gx1Cli };
