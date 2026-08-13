import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import type { FieldValue, Patch, PatchDriver } from "@tonesmith/core";
import { attempt, deviceField, ok } from "../common";

/** Rejects an input that asks for no change at all, or for a patch edit without naming the patch. */
const requireSomethingToChange = (ref?: string, fields?: object, setName?: string): void => {
  if (fields === undefined && setName === undefined) {
    throw new Error(
      "Nothing to change: pass `fields` (with `ref`) to edit a patch, `setName` to rename " +
        "the patch set, or both."
    );
  }
  if (fields !== undefined && ref === undefined) {
    throw new Error("`ref` is required alongside `fields`, since it selects which patch to edit.");
  }
};

/**
 * Applies a batch of dot-path edits to one patch and reports what landed. Every edit lands in
 * memory before anything is written, so a rejected edit anywhere in the set leaves the file
 * exactly as it was rather than half-applied. The report reads the values back out of the edit
 * rather than re-deriving them, so what it says is what the patch now holds.
 */
const editPatch = <T extends Patch>(
  driver: PatchDriver<T>,
  patch: T,
  fields: Record<string, FieldValue>,
): string => {
  const applied = patchUtils.applyFieldEdits(driver, patch, Object.entries(fields));
  return Object.entries(applied)
    .map(([field, value]) => `${field} = ${JSON.stringify(value)}`)
    .join(", ");
};

const registerWriteFields = (server: McpServer): void => {
  server.registerTool(
    "write_fields",
    {
      description:
        "Edit a patch file: one or more fields of a single patch, the name of the patch set, or " +
        "both. Patch fields use dot-notation, as in 'amp.gain', 'fx1.params.rate', " +
        "'ns.threshold', 'delay.time'. A path naming a field the device doesn't have is rejected, " +
        "listing the valid fields at that level. The whole set is applied together, so if any " +
        "edit is rejected the file is left untouched.",
      inputSchema: z.object({
        file: z.string().describe("Path to the patch file"),
        device: deviceField,
        ref: z.string().optional().describe(
          "Patch index (0-based integer) or exact patch name. Required with `fields`; not needed " +
            "to rename the set on its own."
        ),
        fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
          'Dot-path → new value, e.g. { "amp.gain": 72, "fx1.params.rate": 50, "key": "G" }. ' +
            "Pass each value as the type read_patch shows for that field; a string spelling a " +
            "number or a boolean is read as one where the field takes one."
        ),
        setName: z.string().optional().describe(
          "New name for the patch set: the file's own label, shown as `setName` by read_patch. " +
            "Applies to the file rather than to any one patch."
        ),
      }),
    },
    ({ file, device, ref, fields, setName }) => attempt(() => {
      requireSomethingToChange(ref, fields, setName);

      const driver = registry.getDriver(device);
      const patchFile = driver.readFile(file);
      const changes: string[] = [];

      if (fields !== undefined && ref !== undefined) {
        const index = patchUtils.resolvePatchIndex(patchFile.patches, ref);
        changes.push(`patch ${index}: ${editPatch(driver, patchFile.patches[index], fields)}`);
      }

      if (setName !== undefined) {
        patchFile.name = setName;
        changes.push(`set name = ${JSON.stringify(setName)}`);
      }

      driver.writeFile(patchFile, file);
      return ok(`Updated ${file}: ${changes.join("; ")}`);
    })
  );
};

export { registerWriteFields };
