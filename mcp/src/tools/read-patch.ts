import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { PatchFile } from "@tonesmith/core";
import { patchUtils, registry } from "@tonesmith/core";
import { attempt, deviceField, ok } from "../common";

/**
 * How many patches one read returns when the caller doesn't say. A decoded patch runs to roughly
 * 1.4 KB of JSON, so a device library of a few hundred would answer with hundreds of KB that
 * nothing asked for and some clients refuse outright. Twenty keeps the default response under the
 * 45 KB describe_device is held to; a caller wanting more says so.
 */
const DEFAULT_LIMIT = 20;

const MAX_LIMIT = 100;

/** One window of a file's patches, with what it took to reach the ones outside it. */
const page = (file: PatchFile, offset: number, limit: number): object => {
  const window = file.patches.slice(offset, offset + limit);
  const patches = window.map((patch, position) => ({ index: offset + position, patch }));

  const next = offset + window.length;
  const remaining = file.patches.length - next;
  const more = remaining > 0
    ? `${remaining} more patch(es) in this file: call again with offset: ${next}.`
    : undefined;
  return { setName: file.name, total: file.patches.length, offset, patches, more };
};

const registerReadPatch = (server: McpServer): void => {
  server.registerTool(
    "read_patch",
    {
      description:
        "Read decoded patches from a patch file. The patch itself arrives under `patch`, beside " +
        "`setName`, the name of the patch set the file holds. Naming a `ref` returns that one " +
        `patch; omitting it returns the first ${DEFAULT_LIMIT} and says how many the file holds, ` +
        "since a full library is more than a caller usually wants in one response.",
      inputSchema: z.object({
        file: z.string().describe("Path to the patch file"),
        device: deviceField,
        ref: z.string().optional().describe(
          "Patch index (0-based integer) or exact patch name. Omit to page through the file."
        ),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(
          `How many patches to return, up to ${MAX_LIMIT} (default ${DEFAULT_LIMIT}). Ignored when \`ref\` names a patch.`
        ),
        offset: z.number().int().min(0).optional().describe(
          "Index to start at (default 0). Ignored when `ref` names a patch."
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ file, device, ref, limit, offset }) => attempt(() => {
      const driver = registry.getDriver(device);
      const patchFile = driver.readFile(file);

      if (ref !== undefined) {
        const { index, patch } = patchUtils.resolvePatch(patchFile.patches, ref);
        // The patch sits under its own key rather than spread across the envelope, here and in
        // `page`, so a block named `index` or `setName` cannot shadow what the read reports.
        return ok(JSON.stringify({ setName: patchFile.name, index, patch }));
      }

      return ok(JSON.stringify(page(patchFile, offset ?? 0, limit ?? DEFAULT_LIMIT)));
    })
  );
};

export { registerReadPatch };
