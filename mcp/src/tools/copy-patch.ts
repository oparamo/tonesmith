import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { patchUtils, registry } from "@tonesmith/core";
import { attempt, deviceField, ok } from "../common";

const registerCopyPatch = (server: McpServer): void => {
  server.registerTool(
    "copy_patch",
    {
      description:
        "Copy one patch into a slot in another patch file, replacing whatever sits there. Both " +
        "files must already exist. To add a patch without displacing one, build it with " +
        "generate_patch instead, which appends by name.",
      inputSchema: z.object({
        device: deviceField,
        src: z.string().describe("Path to the patch file to copy from"),
        srcRef: z.string().describe("Patch to copy: index (0-based integer) or exact patch name."),
        dst: z.string().describe("Path to the patch file to copy into. May be the same as `src`."),
        dstRef: z.string().describe(
          "Slot to overwrite: index (0-based integer) or exact patch name. The patch already " +
            "there is replaced."
        ),
      }),
      // Replacing the patch in the destination slot is the whole operation, so it is destructive
      // by design rather than by accident.
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ device, src, srcRef, dst, dstRef }) => attempt(() => {
      const driver = registry.getDriver(device);
      const copied = patchUtils.copyPatch(driver, { src, srcRef, dst, dstRef });
      return ok(
        `Copied "${copied.name}" from ${src} patch ${copied.fromIndex} into ${dst} patch ${copied.toIndex}.`
      );
    })
  );
};

export { registerCopyPatch };
