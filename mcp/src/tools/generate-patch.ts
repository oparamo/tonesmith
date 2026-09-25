import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { attempt, deviceField, ok } from "../common";

const inputSchema = z.object({
  device: deviceField,
  outPath: z.string().describe(
    "Output file path. Parent directories are created if missing. Saving upserts by patch name: " +
    "an existing patch of the same name is replaced, any other patch is appended, and a missing " +
    "file is created."
  ),
  setName: z.string().optional().describe(
    "Name for the patch set stored in the file. Defaults to the first patch's name."
  ),
  patches: z.array(z.looseObject({ name: z.string() })).min(1).describe(
    "Every patch to save, in the order they should sit in the file. Each entry is one patch spec " +
    "for this device: `name`, an optional `chain`, and one entry per block you want set. Call " +
    "describe_device first for the device's blocks, their types, and each type's params. A block " +
    "you leave out stays off. Pass the whole set in one call rather than one call per patch."
  ),
});

const registerGeneratePatch = (server: McpServer): void => {
  server.registerTool(
    "generate_patch",
    {
      title: "Generate patches",
      description: `Build patches from structured parameters and save them as a device patch file.

Two calls build any patch: describe_device for the device's blocks, types and params, then this.
A block's params go where read_patch shows them for that block, and the types and value ranges
come from describe_device rather than from this schema, so make that call first.

\`patches\` takes an array, so a whole set goes out in ONE call. Pass every patch you intend to
save rather than calling this once per patch. The array's order is the order they sit in the file,
and the file is written once. Unset params take the device's factory default for the chosen type,
and the patch echoed back under \`patch\` is the complete resulting state, so no follow-up read is
needed.`,
      inputSchema,
      // A patch whose name is already in the file replaces it, so a save can overwrite work.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ device, outPath, setName, patches }) => attempt(async () => {
      const driver = registry.getDriver(device);
      const { file, created, saved } = await patchUtils.upsertPatches(driver, {
        path: outPath, specs: patches, setName,
      });

      // The patch sits under its own key, matching read_patch, so a caller that reads a patch and
      // generates one meets one shape. Echoing it whole is what lets the caller confirm every field
      // the builder defaulted without a follow-up read_patch.
      const results = saved.map(({ name, action, patch }) => ({ name, action, patch }));

      const fileVerb = created ? "Created" : "Updated";
      const response = {
        summary:
          `${fileVerb} ${outPath}: saved ${saved.length} patch(es), ` +
          `${file.patches.length} total in set "${file.name}"`,
        file: { path: outPath, setName: file.name, total: file.patches.length, created },
        patches: results,
      };
      return ok(JSON.stringify(response));
    })
  );
};

export { registerGeneratePatch };
