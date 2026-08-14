import type { Patch, PatchDriver } from "@tonesmith/core";
import type { CliDescriptor, PrintPatch } from "../types";
import { configureDeviceCommands } from "./commands";

/**
 * Builds one device's roster entry from its id and its patch printer. That an id always yields a
 * driver for that device's own patch type is a fact the device-agnostic CliDescriptor can't
 * express, so the assertion saying so lives here once rather than in every device's barrel.
 */
const cliDevice = <T extends Patch>(id: string, printPatch: PrintPatch<T>): CliDescriptor => ({
  id,
  configure: (cmd, driver) => { configureDeviceCommands(cmd, driver as PatchDriver<T>, printPatch); },
});

export { cliDevice };
