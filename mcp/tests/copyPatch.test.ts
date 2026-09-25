/**
 * A pass-through to `patchService.copyPatch`, so there is little here that is the tool's own.
 * Resolving either ref, replacing the slot, and refusing an index past the end are
 * `@tonesmith/core`'s and are proven in `core/tests/service/patchService.test.ts`. What is left is that the
 * tool reaches the driver at all, and that a driver throw comes back as a tool error.
 */
import { describe, it, expect, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { gx1, patchService } from "@tonesmith/core";
import { join } from "node:path";
import { connectClient, withTempDir, patchAt, present } from "./helpers";

describe("copy_patch", () => {
  let close: () => Promise<void>;
  let cleanup: () => Promise<void> = () => Promise.resolve();
  afterEach(async () => { await close(); await cleanup(); });

  it("copies through the driver and leaves the destination file readable", async () => {
    const temp = await withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const destination = join(temp.dir, "destination.tsl");
    await writeFile(destination, gx1.driver.serializeFile(gx1.driver.newFile("destination", 1)));
    const sourceName = (await patchAt(temp.fixture)).name;

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: temp.fixture, srcRef: "0", dst: destination, dstRef: "0",
    });

    expect(result.isError).toBe(false);
    expect((await patchAt(destination)).name).toBe(sourceName);
    const written = await patchService.readPatchFile(gx1.driver, destination);
    expect(present(written.patches, "the destination's patches")).toHaveLength(1);
  });

  it("answers a driver throw with an error rather than letting it escape", async () => {
    const temp = await withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: join(temp.dir, "missing.tsl"), srcRef: "0", dst: temp.fixture, dstRef: "0",
    });

    expect(result.isError).toBe(true);
  });
});
