import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Patch, PatchDriver } from "@tonesmith/core";
import { patchUtils, patchView, registry } from "@tonesmith/core";
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

type PatchSpec = z.infer<typeof inputSchema>["patches"][number];

/**
 * Builds every patch, naming which one failed. A rejection out of a batch of eight otherwise says
 * only which block was wrong, and the same block is present in all eight.
 */
const buildAll = (driver: PatchDriver, specs: PatchSpec[]): Patch[] =>
  specs.map((spec, index) => {
    try {
      return driver.buildPatch(spec);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`patches[${index}] "${spec.name}": ${reason}`);
    }
  });

/**
 * The patch as the file holds it, rather than as the builder assembled it.
 *
 * A block's decoded shape is per-type, but a builder filling one struct covering every type leaves
 * fields the chosen type has no params for. The codec drops them on the way to bytes, so a round
 * trip through it is what the caller would read back. This echo is documented as the confirmation
 * that replaces a follow-up read_patch, which is why it has to agree with the file rather than with
 * the builder.
 */
const asStored = (driver: PatchDriver, patch: Patch): Patch =>
  driver.decodePatch(driver.encodePatch(patch));

const registerGeneratePatch = (server: McpServer): void => {
  server.registerTool(
    "generate_patch",
    {
      description: `Build patches from structured parameters and save them as a device patch file.

Two calls build any patch: describe_device for the device's blocks, types and params, then this.
A block's params go where read_patch shows them for that block, and the types and value ranges
come from describe_device rather than from this schema, so make that call first.

\`patches\` takes an array, so a whole set goes out in ONE call. Pass every patch you intend to
save rather than calling this once per patch. The array's order is the order they sit in the file,
and the file is written once. Unset params take the device's factory default for the chosen type,
and the patch echoed back is the complete resulting state, so no follow-up read is needed.`,
      inputSchema,
      // A patch whose name is already in the file replaces it, so a save can overwrite work.
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    ({ device, outPath, setName, patches }) => attempt(() => {
      const driver = registry.getDriver(device);
      const built = buildAll(driver, patches);
      // Every round trip happens before the write, so a patch this codec cannot store fails the
      // call with the file untouched rather than after it has already been replaced on disk.
      const stored = built.map(patch => asStored(driver, patch));

      const { file, created, saved } = patchUtils.upsertPatches(driver, {
        path: outPath, patches: built, setName,
      });

      const results = stored.map((patch, index) => ({
        name: patch.name,
        action: saved[index].action,
        // State the stored order outright, so a caller that omitted `chain` sees the default
        // it took rather than having to look it up.
        chain: patch.chain,
        // Echo back the stored patch so the caller can confirm every field the builder
        // defaulted, without a follow-up read_patch.
        patch: patchView.presentPatch(patch),
      }));

      const fileVerb = created ? "Created" : "Updated";
      const response = {
        summary:
          `${fileVerb} ${outPath}: saved ${built.length} patch(es), ` +
          `${file.patches.length} total in set "${file.name}"`,
        file: { path: outPath, setName: file.name, total: file.patches.length, created },
        patches: results,
      };
      return ok(JSON.stringify(response));
    })
  );
};

export { registerGeneratePatch };
