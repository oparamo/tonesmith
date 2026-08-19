/**
 * A pass-through to `patchUtils.createPatchFile`, which owns the set name, the blank patches, the
 * parent directories and the refusal to overwrite, all proven in `core/tests/patch-utils.test.ts`.
 * What this tool adds is the `patchCount` bound declared in its own schema, so an impossible count
 * is refused by the schema rather than after the server has started building.
 */
import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { connectClient, emptyTempDir } from "./helpers";

describe("create_patch_file", () => {
  let close: () => Promise<void>;
  let cleanup: () => void = () => { /* set per test */ };
  afterEach(async () => { await close(); cleanup(); });

  it("creates a file of blank patches the driver can read back", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "fresh.tsl");

    const result = await client.callTool("create_patch_file", {
      device: "gx1", file: path, patchCount: 3,
    });

    expect(result.isError).toBe(false);
    expect(gx1.driver.readFile(path).patches).toHaveLength(3);
  });

  // A mistyped exponent asks for a hundred million blank patches, and the server sits building them.
  it("refuses a patch count past the limit rather than working on it", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "huge.tsl");

    const result = await client.callTool("create_patch_file", {
      device: "gx1", file: path, patchCount: 1e8,
    });

    expect(result.isError).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  it("answers a driver throw with an error rather than letting it escape", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "taken.tsl");
    gx1.driver.writeFile(gx1.driver.newFile("taken", 4), path);

    const result = await client.callTool("create_patch_file", { device: "gx1", file: path });

    expect(result.isError).toBe(true);
    expect(gx1.driver.readFile(path).patches, "the file it refused is untouched").toHaveLength(4);
  });
});
