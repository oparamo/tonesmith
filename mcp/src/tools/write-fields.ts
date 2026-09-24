import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import type { FieldEdits } from "@tonesmith/core";
import { attempt, deviceField, ok } from "../common";

/** What the edit wrote, read back from core's report so it says what the patch now holds. */
const describeApplied = (applied: FieldEdits): string =>
  Object.entries(applied)
    .map(([field, value]) => `${field} = ${JSON.stringify(value)}`)
    .join(", ");

const registerWriteFields = (server: McpServer): void => {
  server.registerTool(
    "write_fields",
    {
      description:
        "Edit a patch file: one or more fields of a single patch, the name of the patch set, or " +
        "both. Patch fields use dot-notation, counted from the patch read_patch returns under " +
        "`patch`: a block's controls sit at '<block>.params.<control>', and a block's own " +
        "selectors at '<block>.on', '<block>.type' and '<block>.subType'. A path naming a field " +
        "the device doesn't have is rejected, listing the valid fields at that level. The whole " +
        "set is applied together, so if any edit is rejected the file is left untouched. " +
        "Setting a block's `type` switches the effect: the block arrives at that type's factory " +
        "settings on its factory sub-model, and the controls of the effect it was are gone. Name " +
        "the ones you want after the type in the same call, spelled as the new type does; paths " +
        "resolve in the order given, so a control named before the type that has it is rejected.",
      inputSchema: z.object({
        file: z.string().describe("Path to the patch file"),
        device: deviceField,
        ref: z.string().optional().describe(
          "Patch index (0-based integer) or exact patch name. Required with `fields`; not needed " +
            "to rename the set on its own."
        ),
        fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe(
          "Dot-path → new value, one entry per field. Take each path from what read_patch shows " +
            "for this patch, and pass the value as the type it shows there; a string spelling a " +
            "number or a boolean is read as one where the field takes one."
        ),
        setName: z.string().optional().describe(
          "New name for the patch set: the file's own label, shown as `setName` by read_patch. " +
            "Applies to the file rather than to any one patch."
        ),
      }),
      // It edits a file the caller already has, which is the destructive case: the values it
      // replaces are gone.
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ file, device, ref, fields, setName }) => attempt(async () => {
      const driver = registry.getDriver(device);
      const edits = fields === undefined ? undefined : Object.entries(fields);
      const report = await patchUtils.editPatchFile(driver, file, { ref, fields: edits, setName });

      const changes: string[] = [];
      if (report.index !== undefined && report.applied !== undefined) {
        changes.push(`patch ${report.index}: ${describeApplied(report.applied)}`);
      }
      if (report.setName !== undefined) {
        changes.push(`set name = ${JSON.stringify(report.setName)}`);
      }
      return ok(`Updated ${file}: ${changes.join("; ")}`);
    })
  );
};

export { registerWriteFields };
