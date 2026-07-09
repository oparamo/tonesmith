import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

const registerReadPatch = (server: McpServer): void => {
  server.registerTool(
    "read_patch",
    {
      description: "Read one or all decoded patches from a patch file. Returns full patch parameter data as JSON.",
      inputSchema: z.object({
        file: z.string().describe("Path to the patch file"),
        device: z.string().describe("Device ID. Use list_devices to enumerate IDs."),
        ref: z.string().optional().describe(
          "Patch index (0-based integer) or exact patch name. Omit to return all patches."
        ),
      }),
    },
    ({ file, device, ref }) => {
      try {
        const driver = registry.getDriver(device);
        const patchFile = driver.readFile(file);
        const indices = patchUtils.resolvePatchIndices(patchFile.patches, ref);
        if (ref !== undefined) {
          const idx = indices[0];
          const patchWithIndex = { index: idx, ...patchFile.patches[idx] };
          return ok(JSON.stringify(patchWithIndex, null, 2));
        }
        const result = {
          setName: patchFile.name,
          patches: indices.map(index => ({ index, ...patchFile.patches[index] })),
        };
        return ok(JSON.stringify(result, null, 2));
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerReadPatch };
