import type { Command } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";

/** Printing a patch is the one command that needs the device's own formatter. */
type PrintPatch<T extends Patch> = (patch: T, index: number) => void;

interface CliDescriptor {
  id: string;
  configure: (cmd: Command, driver: PatchDriver) => void;
}

export type { CliDescriptor, PrintPatch };
