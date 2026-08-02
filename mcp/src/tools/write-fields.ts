import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

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
 * exactly as it was rather than half-applied.
 */
const editPatch = (patch: Record<string, unknown>, fields: Record<string, string>): string => {
  const edits = Object.entries(fields);
  patchUtils.applyFieldEdits(patch, edits);
  return edits
    .map(([field, value]) => `${field} = ${JSON.stringify(patchUtils.coerceValue(value))}`)
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
        device: z.string().describe("Device ID. Use list_devices to enumerate IDs."),
        ref: z.string().optional().describe(
          "Patch index (0-based integer) or exact patch name. Required with `fields`; not needed " +
            "to rename the set on its own."
        ),
        fields: z.record(z.string(), z.string()).optional().describe(
          'Dot-path → new value, e.g. { "amp.gain": "72", "fx1.params.rate": "50", "key": "G" }. ' +
            "Numbers and booleans are coerced from their string form automatically."
        ),
        setName: z.string().optional().describe(
          "New name for the patch set: the file's own label, shown as `setName` by read_patch. " +
            "Applies to the file rather than to any one patch."
        ),
      }),
    },
    ({ file, device, ref, fields, setName }) => {
      try {
        requireSomethingToChange(ref, fields, setName);

        const driver = registry.getDriver(device);
        const patchFile = driver.readFile(file);
        const changes: string[] = [];

        if (fields !== undefined && ref !== undefined) {
          const index = patchUtils.resolvePatchIndex(patchFile.patches, ref);
          const patch = patchFile.patches[index] as unknown as Record<string, unknown>;
          changes.push(`patch ${index}: ${editPatch(patch, fields)}`);
        }

        if (setName !== undefined) {
          patchFile.name = setName;
          changes.push(`set name = ${JSON.stringify(setName)}`);
        }

        driver.writeFile(patchFile, file);
        return ok(`Updated ${file}: ${changes.join("; ")}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerWriteFields };
