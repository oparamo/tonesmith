import type { Command } from "commander";
import { InvalidArgumentError } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { patchUtils, capabilityUtils } from "@tonesmith/core";
import { printChain, printGroups, printGroup, printItem } from "./capabilities-print";
import { printPatch } from "./patch-print";

/**
 * Splits "amp.params.gain=72" at the first "=", so a value containing one survives intact. Without
 * the separator there is nothing to split on, and slicing at an index of -1 drops the argument's
 * last character, sending "amp.params.gain" on as the path "amp.params.gai" to be reported as an
 * unknown field.
 */
const parseFieldAssignment = (assignment: string): [string, string] => {
  const separatorIndex = assignment.indexOf("=");
  if (separatorIndex < 1) {
    throw new Error(`Cannot read "${assignment}" as a field edit: write each one as path=value.`);
  }
  return [assignment.slice(0, separatorIndex), assignment.slice(separatorIndex + 1)];
};

/**
 * Runs one command's work, turning a throw into a printed message and a failing exit code. Setting
 * the code rather than calling process.exit lets the runtime finish flushing stdout, so a failure
 * piped into another command arrives whole.
 */
const run = (action: () => void): void => {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

const addRead = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("read <file> [ref]")
    .description("display one or all patches from a patch file")
    .action((file: string, ref?: string) => {
      run(() => {
        const patchFile = driver.readFile(file);
        // The driver's own name, not the file's `device` id, since this line is for a person.
        console.info(`File: ${file}  |  Set: ${patchFile.name}  |  Device: ${driver.name}`);
        for (const { index, patch } of patchUtils.resolvePatches(patchFile.patches, ref)) {
          printPatch(driver.viewPatch(patch), index);
        }
        console.info();
      });
    });
};

const addWrite = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("write <file> <ref> <fields...>")
    .description("update patch fields by dot-path (block.param=value); see `capabilities` for the names")
    .action((file: string, ref: string, fields: string[]) => {
      run(() => {
        const edits = fields.map(parseFieldAssignment);
        const patchFile = driver.readFile(file);
        const { index, patch } = patchUtils.resolvePatch(patchFile.patches, ref);
        driver.applyEdits(patch, edits);
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

/**
 * Commander hands every option through as a string, and a count that isn't one is a mistake.
 * InvalidArgumentError is what routes it through commander's own usage error rather than out of
 * the parse as an unhandled throw.
 */
const parseCount = (value: string): number => {
  if (!/^\d+$/.test(value.trim())) {
    throw new InvalidArgumentError(`--count takes a whole number of patches (got "${value}").`);
  }
  return Number(value.trim());
};

const addNew = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("new <file>")
    .description("create a blank patch file")
    .option("--set-name <name>", "name for the patch set stored in the file (default: the filename)")
    .option("--count <n>", "how many blank patches it opens with", parseCount)
    .action((file: string, options: { setName?: string; count?: number }) => {
      run(() => {
        const patchFile = patchUtils.createPatchFile(driver, file, {
          setName: options.setName,
          patchCount: options.count,
        });
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

        // The chain sits alongside the groups in the listing, so it answers to the same
        // case-insensitive match they do, and to a second argument the same way: there is nothing
        // under it to name.
        if (groupId.toLowerCase() === "chain") {
          if (item) throw new Error(`The chain has no items, so there is no "${item}" to show.`);
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
const configureDeviceCommands = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  addRead(cmd, driver);
  addWrite(cmd, driver);
  addCopy(cmd, driver);
  addNew(cmd, driver);
  addCapabilities(cmd, driver);
};

export { configureDeviceCommands };
