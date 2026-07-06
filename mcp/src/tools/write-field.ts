import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

const registerWriteField = (server: McpServer): void => {
  server.registerTool(
    "write_field",
    {
      description:
        "Edit a specific field in a patch within a .tsl file using dot-notation. " +
        "Examples: 'amp.gain', 'fx1.params.rate', 'ns.threshold', 'delay.timeMs'.",
      inputSchema: {
        file: z.string().describe("Path to the .tsl file"),
        device: z.string().describe("Device ID. Use list_devices to enumerate IDs."),
        ref: z.string().describe("Patch index (0-based integer) or exact patch name"),
        field: z.string().describe("Dot-notation field path (e.g. 'amp.gain', 'fx1.params.rate')"),
        value: z.string().describe("New value — numbers are coerced from string automatically"),
      },
    },
    async ({ file, device, ref, field, value }) => {
      try {
        const driver = registry.requireDriver(device);
        const patchFile = driver.readFile(file);
        const idx = patchUtils.resolvePatchIndex(patchFile.patches, ref);
        const patch = patchFile.patches[idx] as unknown as Record<string, unknown>;
        patchUtils.applyFieldEdits(patch, [[field, value]]);
        driver.writeFile(patchFile, file);
        return ok(`Updated ${file} patch ${idx}: ${field} = ${JSON.stringify(patchUtils.coerceValue(value))}`);
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerWriteField };
