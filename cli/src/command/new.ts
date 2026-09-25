import type { Command } from "commander";
import { InvalidArgumentError } from "commander";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { patchUtils } from "@tonesmith/core";
import { run } from "../common";

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
    .action((file: string, options: { setName?: string; count?: number }) =>
      run(async () => {
        const patchFile = await patchUtils.createPatchFile(driver, file, {
          setName: options.setName,
          patchCount: options.count,
        });
        console.info(
          `Created ${file} with ${patchFile.patches.length} blank patch(es), set name '${patchFile.name}'`
        );
      })
    );
};

export { addNew };
