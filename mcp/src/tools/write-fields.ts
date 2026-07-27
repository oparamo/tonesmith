import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

const registerWriteFields = (server: McpServer): void => {
  server.registerTool(
    "write_fields",
    {
      description:
        "Edit one or more fields in a patch within a patch file using dot-notation. " +
        "Examples: 'amp.gain', 'fx1.params.rate', 'ns.threshold', 'delay.time'. " +
        "The whole set is applied together — if any edit is rejected, the file is left untouched.",
      inputSchema: z.object({
        file: z.string().describe("Path to the patch file"),
        device: z.string().describe("Device ID. Use list_devices to enumerate IDs."),
        ref: z.string().describe("Patch index (0-based integer) or exact patch name"),
        fields: z.record(z.string(), z.string()).describe(
          'Dot-path → new value, e.g. { "amp.gain": "72", "fx1.params.rate": "50", "key": "G" }. ' +
            "Numbers and booleans are coerced from their string form automatically."
        ),
      }),
    },
    ({ file, device, ref, fields }) => {
      try {
        const driver = registry.getDriver(device);
        const patchFile = driver.readFile(file);
        const idx = patchUtils.resolvePatchIndex(patchFile.patches, ref);
        const patch = patchFile.patches[idx] as unknown as Record<string, unknown>;
        const edits = Object.entries(fields);
        // Every edit lands in memory before anything is written, so a rejected edit anywhere in the
        // set leaves the file exactly as it was rather than half-applied.
        patchUtils.applyFieldEdits(patch, edits);
        driver.writeFile(patchFile, file);
        const applied = edits
          .map(([field, value]) => `${field} = ${JSON.stringify(patchUtils.coerceValue(value))}`)
          .join(", ");
        return ok(`Updated ${file} patch ${idx}: ${applied}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerWriteFields };
