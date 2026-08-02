import type { Command } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { patchUtils, patchView, capabilityUtils } from "@tonesmith/core";
import { printChain, printGroups, printGroup, printItem } from "./capabilities-print";

/** Splits "amp.gain=72" at the first "=", so a value containing one survives intact. */
const parseFieldAssignment = (assignment: string): [string, string] => {
  const separatorIndex = assignment.indexOf("=");
  return [assignment.slice(0, separatorIndex), assignment.slice(separatorIndex + 1)];
};

const run = (action: () => void): void => {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
};

/** Printing a patch is the one command that needs the device's own formatter. */
type PrintPatch<T extends Patch> = (patch: T, index: number) => void;

const addRead = <T extends Patch>(cmd: Command, driver: PatchDriver<T>, printPatch: PrintPatch<T>): void => {
  cmd
    .command("read <file> [ref]")
    .description("display one or all patches from a patch file")
    .action((file: string, ref?: string) => {
      run(() => {
        const patchFile = driver.readFile(file);
        console.info(`File: ${file}  |  Set: ${patchFile.name}  |  Device: ${patchFile.device}`);
        for (const index of patchUtils.resolvePatchIndices(patchFile.patches, ref)) {
          printPatch(patchView.presentPatch(patchFile.patches[index]), index);
        }
        console.info();
      });
    });
};

const addWrite = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("write <file> <ref> <fields...>")
    .description("update patch fields by dot-path (e.g. amp.gain=72, key=G)")
    .action((file: string, ref: string, fields: string[]) => {
      run(() => {
        const patchFile = driver.readFile(file);
        const index = patchUtils.resolvePatchIndex(patchFile.patches, ref);
        const patch = patchFile.patches[index] as unknown as Record<string, unknown>;
        patchUtils.applyFieldEdits(patch, fields.map(parseFieldAssignment));
        driver.writeFile(patchFile, file);
        console.info(`Wrote ${file}, patch ${index} updated: ${fields.join(", ")}`);
      });
    });
};

const addCopy = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("copy <src> <srcRef> <dst> <dstRef>")
    .description("copy a patch from one patch file to another")
    // eslint-disable-next-line max-params -- commander passes one argument per declared operand
    .action((src: string, srcRef: string, dst: string, dstRef: string) => {
      run(() => {
        const copied = patchUtils.copyPatch(driver, { src, srcRef, dst, dstRef });
        console.info(`Copied '${copied.name}' → ${dst} patch ${copied.toIndex}`);
      });
    });
};

const addNew = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("new <file> [setName] [nPatches]")
    .description("create a blank patch file")
    .action((file: string, setName?: string, patchCountStr?: string) => {
      run(() => {
        const patchCount = patchCountStr === undefined ? undefined : parseInt(patchCountStr, 10);
        const patchFile = patchUtils.createPatchFile(driver, file, { setName, patchCount });
        console.info(
          `Created ${file} with ${patchFile.patches.length} blank patch(es), set name '${patchFile.name}'`
        );
      });
    });
};

const addCapabilities = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("capabilities [group] [item]")
    .description("browse supported effects, amp models, and other device capabilities")
    .action((groupId?: string, item?: string) => {
      run(() => {
        const caps = driver.capabilities;

        if (!groupId) {
          printGroups(caps);
          return;
        }

        if (groupId === "chain") {
          printChain(caps.chain);
          return;
        }

        const group = capabilityUtils.findGroup(caps, groupId);

        if (!item) {
          printGroup(group);
          return;
        }

        const foundItem = capabilityUtils.findItem(group, item);
        printItem(group, foundItem);
      });
    });
};

/** Every command a device gets for free, in the order they appear in `--help`. */
const configureDeviceCommands = <T extends Patch>(
  cmd: Command,
  driver: PatchDriver<T>,
  printPatch: PrintPatch<T>,
): void => {
  addRead(cmd, driver, printPatch);
  addWrite(cmd, driver);
  addCopy(cmd, driver);
  addNew(cmd, driver);
  addCapabilities(cmd, driver);
};

export { configureDeviceCommands };
