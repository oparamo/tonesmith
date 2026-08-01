import type { Command } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { patchUtils, patchView, capabilityUtils } from "@tonesmith/core";
import { printChain, printGroups, printGroup, printItem } from "./capabilities-print";

const run = (action: () => void): void => {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
};

const configureDeviceCommands = <T extends Patch>(
  cmd: Command,
  driver: PatchDriver<T>,
  printPatch: (patch: T, index: number) => void,
): void => {
  cmd
    .command("read <file> [ref]")
    .description("display one or all patches from a patch file")
    .action((file: string, ref?: string) => {
      run(() => {
        const patchFile = driver.readFile(file);
        console.info(`File: ${file}  |  Set: ${patchFile.name}  |  Device: ${patchFile.device}`);
        for (const i of patchUtils.resolvePatchIndices(patchFile.patches, ref)) {
          printPatch(patchView.presentPatch(patchFile.patches[i]), i);
        }
        console.info();
      });
    });

  cmd
    .command("write <file> <ref> <fields...>")
    .description("update patch fields by dot-path (e.g. amp.gain=72, key=G)")
    .action((file: string, ref: string, fields: string[]) => {
      run(() => {
        const patchFile = driver.readFile(file);
        const idx = patchUtils.resolvePatchIndex(patchFile.patches, ref);
        const patch = patchFile.patches[idx] as unknown as Record<string, unknown>;
        const edits = fields.map((fieldAssignment): [string, string] => {
          const separatorIndex = fieldAssignment.indexOf("=");
          return [fieldAssignment.slice(0, separatorIndex), fieldAssignment.slice(separatorIndex + 1)];
        });
        patchUtils.applyFieldEdits(patch, edits);
        driver.writeFile(patchFile, file);
        console.info(`Wrote ${file} — patch ${idx} updated: ${fields.join(", ")}`);
      });
    });

  cmd
    .command("copy <src> <srcRef> <dst> <dstRef>")
    .description("copy a patch from one patch file to another")
    .action((src: string, srcRef: string, dst: string, dstRef: string) => {
      run(() => {
        const copied = patchUtils.copyPatch(driver, { src, srcRef, dst, dstRef });
        console.info(`Copied '${copied.name}' → ${dst} patch ${copied.toIndex}`);
      });
    });

  cmd
    .command("new <file> [setName] [nPatches]")
    .description("create a blank patch file")
    .action((file: string, setName?: string, patchCountStr?: string) => {
      run(() => {
        const patchCount = patchCountStr !== undefined ? parseInt(patchCountStr, 10) : undefined;
        const patchFile = patchUtils.createPatchFile(driver, file, { setName, patchCount });
        console.info(
          `Created ${file} with ${patchFile.patches.length} blank patch(es), set name '${patchFile.name}'`
        );
      });
    });

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

export { configureDeviceCommands };
