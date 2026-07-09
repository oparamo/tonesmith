import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

const registerWriteField = (server: McpServer): void => {
  server.registerTool(
    "write_field",
    {
      description:
        "Edit a specific field in a patch within a patch file using dot-notation. " +
        "Examples: 'amp.gain', 'fx1.params.rate', 'ns.threshold', 'delay.timeMs'.",
      inputSchema: z.object({
        file: z.string().describe("Path to the patch file"),
        device: z.string().describe("Device ID. Use list_devices to enumerate IDs."),
        ref: z.string().describe("Patch index (0-based integer) or exact patch name"),
        field: z.string().describe("Dot-notation field path (e.g. 'amp.gain', 'fx1.params.rate')"),
        value: z.string().describe("New value — numbers are coerced from string automatically"),
      }),
    },
    ({ file, device, ref, field, value }) => {
      try {
        const driver = registry.getDriver(device);
        const patchFile = driver.readFile(file);
        const idx = patchUtils.resolvePatchIndex(patchFile.patches, ref);
        const patch = patchFile.patches[idx] as unknown as Record<string, unknown>;
        patchUtils.applyFieldEdits(patch, [[field, value]]);
        driver.writeFile(patchFile, file);
        const coercedValue = patchUtils.coerceValue(value);
        return ok(`Updated ${file} patch ${idx}: ${field} = ${JSON.stringify(coercedValue)}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerWriteField };
