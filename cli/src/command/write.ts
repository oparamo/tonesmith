import type { Command } from "commander";
import type { FieldEdits, Patch, PatchDriver } from "@tonesmith/core";
import { patchService } from "@tonesmith/core";
import { run } from "../common";

/**
 * Splits a "path=value" argument at the first "=", so a value containing one survives intact. An
 * argument with no "=", or nothing before it, is refused here: slicing at an index of -1 would drop
 * its last character and send the path on as an unknown field one character short.
 */
const parseFieldAssignment = (assignment: string): [string, string] => {
  const separatorIndex = assignment.indexOf("=");
  if (separatorIndex < 1) {
    throw new Error(`Cannot read "${assignment}" as a field edit: write each one as path=value.`);
  }
  return [assignment.slice(0, separatorIndex), assignment.slice(separatorIndex + 1)];
};

/** What an edit wrote, in the path=value form the command takes. */
const describeApplied = (applied: FieldEdits): string =>
  Object.entries(applied).map(([path, value]) => `${path}=${String(value)}`).join(", ");

const addWrite = <T extends Patch>(cmd: Command, driver: PatchDriver<T>): void => {
  cmd
    .command("write <file> <ref> <fields...>")
    .description("update patch fields by dot-path (block.param=value); see `capabilities` for the names")
    .action((file: string, ref: string, fields: string[]) =>
      run(async () => {
        const edits = fields.map(parseFieldAssignment);
        const { index, applied = {} } = await patchService.editPatchFile(driver, file, { ref, fields: edits });
        console.info(`Wrote ${file}, patch ${String(index)} updated: ${describeApplied(applied)}`);
      })
    );
};

export { addWrite };
