import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { patchUtils } from "tonesmith";
import { ok, err, requireDriver } from "../common";

const registerReadPatch = (server: McpServer): void => {
  server.registerTool(
    "read_patch",
    {
      description: "Read one or all decoded patches from a .tsl file. Returns full patch parameter data as JSON.",
      inputSchema: {
        file: z.string().describe("Path to the .tsl patch file"),
        device: z.string().describe("Device ID. Use list_devices to enumerate IDs."),
        ref: z.string().optional().describe(
          "Patch index (0-based integer) or exact patch name. Omit to return all patches."
        ),
      },
    },
    async ({ file, device, ref }) => {
      try {
        const driver = requireDriver(device);
        const patchFile = driver.readFile(file);
        if (ref !== undefined) {
          const idx = patchUtils.resolvePatchIndex(patchFile.patches, ref);
          return ok(JSON.stringify({ index: idx, ...patchFile.patches[idx] }, null, 2));
        }
        return ok(JSON.stringify({
          setName: patchFile.name,
          patches: patchFile.patches.map((p, i) => ({ index: i, ...p })),
        }, null, 2));
      } catch (e) {
        return err(e);
      }
    }
  );
};

export { registerReadPatch };
