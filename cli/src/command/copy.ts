import type { Command } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { patchService } from "@tonesmith/core";
import { run } from "../common";

const addCopy = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("copy <src> <srcRef> <dst> <dstRef>")
    .description("copy a patch from one patch file to another")
    // eslint-disable-next-line max-params -- commander passes one argument per declared operand
    .action((src: string, srcRef: string, dst: string, dstRef: string) =>
      run(async () => {
        const copied = await patchService.copyPatch(driver, { src, srcRef, dst, dstRef });
        console.info(`Copied '${copied.name}' → ${dst} patch ${copied.toIndex}`);
      })
    );
};

export { addCopy };
