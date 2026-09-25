import type { Command } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { patchService } from "@tonesmith/core";
import { printPatch, run } from "../common";

const addRead = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("read <file> [ref]")
    .description("display one or all patches from a patch file")
    .action((file: string, ref?: string) =>
      run(async () => {
        const patchFile = await patchService.readPatchFile(driver, file);
        // The driver's own name, not the file's `device` id, since this line is for a person.
        console.info(`File: ${file}  |  Set: ${patchFile.name}  |  Device: ${driver.name}`);
        for (const { index, patch } of patchService.resolvePatches(patchFile.patches, ref)) {
          printPatch(driver.viewPatch(patch), index);
        }
        console.info();
      })
    );
};

export { addRead };
