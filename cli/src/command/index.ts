import type { Command } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { addRead } from "./read";
import { addWrite } from "./write";
import { addCopy } from "./copy";
import { addNew } from "./new";
import { addCapabilities } from "./capabilities";

/** Every command a device gets for free, in the order they appear in `--help`. */
const configureDeviceCommands = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  addRead(cmd, driver);
  addWrite(cmd, driver);
  addCopy(cmd, driver);
  addNew(cmd, driver);
  addCapabilities(cmd, driver);
};

export { configureDeviceCommands };
