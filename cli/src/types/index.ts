import type { Command } from "commander";
import type { PatchDriver } from "tonesmith";

type CliDescriptor = {
  id: string;
  description: string;
  configure: (cmd: Command, driver: PatchDriver) => void;
};

export type { CliDescriptor };
