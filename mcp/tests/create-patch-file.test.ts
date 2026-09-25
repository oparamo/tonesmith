/**
 * A pass-through to `patchUtils.createPatchFile`, which owns the set name, the blank patches, the
 * parent directories and the refusal to overwrite, all proven in `core/tests/patch-utils.test.ts`.
 * What this tool adds is the `patchCount` bound declared in its own schema, so an impossible count
 * is refused by the schema rather than after the server has started building.
 */
import { describe, it, expect, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { gx1, patchUtils } from "@tonesmith/core";
import { join } from "node:path";
import { connectClient, emptyTempDir, pathExists } from "./helpers";

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
      device: "gx1", file: path, patchCount: 3,
    });

    expect(result.isError).toBe(false);
    expect((await patchUtils.readPatchFile(gx1.driver, path)).patches).toHaveLength(3);
  });

  // A mistyped exponent asks for a hundred million blank patches, and the server sits building them.
  it("refuses a patch count past the limit rather than working on it", async () => {
    const temp = await emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "huge.tsl");

    const result = await client.callTool("create_patch_file", {
      device: "gx1", file: path, patchCount: 1e8,
    });

    expect(result.isError).toBe(true);
    expect(await pathExists(path)).toBe(false);
  });

  it("answers a driver throw with an error rather than letting it escape", async () => {
    const temp = await emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "taken.tsl");
    await writeFile(path, gx1.driver.serializeFile(gx1.driver.newFile("taken", 4)));

    const result = await client.callTool("create_patch_file", { device: "gx1", file: path });

    expect(result.isError).toBe(true);
    const untouched = await patchUtils.readPatchFile(gx1.driver, path);
    expect(untouched.patches, "the file it refused is untouched").toHaveLength(4);
  });
});
