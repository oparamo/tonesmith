import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { attempt, deviceField, ok } from "../common";

const registerCreatePatchFile = (server: McpServer): void => {
  server.registerTool(
    "create_patch_file",
    {
      description:
        "Create an empty patch file of blank patches at the device's factory defaults, for filling " +
        "in later with write_fields or copy_patch. An existing file is never overwritten. Building " +
        "patches from parameters needs none of this: generate_patch creates its own output file.",
      inputSchema: z.object({
        device: deviceField,
        file: z.string().describe("Path to create. Parent directories are created if missing."),
        setName: z.string().optional().describe(
          "Name for the patch set the file holds. Defaults to the filename without its extension."
        ),
        patchCount: z.number().int().min(1).max(patchUtils.MAX_NEW_PATCHES).optional().describe(
          `How many blank patches to start with (default 1, at most ${patchUtils.MAX_NEW_PATCHES}).`
        ),
      }),
      // It writes, but only where there is no file: an existing one is refused rather than replaced.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ device, file, setName, patchCount }) => attempt(() => {
      const driver = registry.getDriver(device);
      const created = patchUtils.createPatchFile(driver, file, { setName, patchCount });
      return ok(
        `Created ${file} with ${created.patches.length} blank patch(es), set name "${created.name}".`
      );
    })
  );
};

export { registerCreatePatchFile };
