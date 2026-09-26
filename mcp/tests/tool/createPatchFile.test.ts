/**
 * A pass-through to `patchService.createPatchFile`, which owns the set name, the blank patches, the
 * parent directories and the refusal to overwrite, all proven in
 * `core/tests/service/patchService.test.ts`. What this tool adds is the `patchCount` bound declared
 * in its own schema, so an impossible count is refused by the schema rather than after the server
 * has started building.
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { patchService } from "@tonesmith/core";
import { connectClient, emptyTempDir, fakeDriver, FAKE_DEVICE_ID } from "../helpers";

describe("create_patch_file", () => {
  let close: () => Promise<void>;
  let cleanup: () => Promise<void> = () => Promise.resolve();
  afterEach(async () => { await close(); await cleanup(); });

  it("creates a file of blank patches the driver can read back", async () => {
    const temp = await emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "fresh.tsl");

    const result = await client.callTool("create_patch_file", {
      device: FAKE_DEVICE_ID, file: path, patchCount: 3,
    });

    expect(result.isError).toBe(false);
    expect((await patchService.readPatchFile(fakeDriver, path)).patches).toHaveLength(3);
  });

  it("reaches the file with the requested set name", async () => {
    const temp = await emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "named.tsl");

    const result = await client.callTool("create_patch_file", {
      device: FAKE_DEVICE_ID, file: path, setName: "Custom Set",
    });

    expect(result.isError).toBe(false);
    expect((await patchService.readPatchFile(fakeDriver, path)).name).toBe("Custom Set");
  });

  it("declares a patchCount bound matching the device's own limit", async () => {
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("create_patch_file") as {
      inputSchema: { properties: { patchCount: { minimum: number; maximum: number } } };
    };

    expect(tool.inputSchema.properties.patchCount.minimum).toBe(1);
    expect(tool.inputSchema.properties.patchCount.maximum).toBe(patchService.MAX_NEW_PATCHES);
  });

  it("declares non-destructive, idempotent and non-open-world annotations and a title", async () => {
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("create_patch_file") as {
      title?: string;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
    };

    expect(tool.title).toBeTruthy();
    expect(tool.annotations?.readOnlyHint).toBe(false);
    expect(tool.annotations?.destructiveHint).toBe(false);
    expect(tool.annotations?.idempotentHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});
