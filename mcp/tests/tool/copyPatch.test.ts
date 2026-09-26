/**
 * A pass-through to `patchService.copyPatch`, so there is little here that is the tool's own.
 * Resolving either ref, replacing the slot, and refusing an index past the end are
 * `@tonesmith/core`'s and are proven in `core/tests/service/patchService.test.ts`. What is left is
 * that the tool reaches the driver at all, and reports what moved.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { connectClient, emptyTempDir, fakeDriver, FAKE_DEVICE_ID } from "../helpers";

describe("copy_patch", () => {
  let close: () => Promise<void>;
  let cleanup: () => Promise<void> = () => Promise.resolve();
  afterEach(async () => { await close(); await cleanup(); });

  it("copies through the driver and reports the patch and both indexes", async () => {
    const temp = await emptyTempDir();
    cleanup = temp.cleanup;
    const src = join(temp.dir, "source.tsl");
    const dst = join(temp.dir, "destination.tsl");
    await writeFile(src, fakeDriver.serializeFile(fakeDriver.newFile("Source", 2)));
    await writeFile(dst, fakeDriver.serializeFile(fakeDriver.newFile("Destination", 1)));
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("copy_patch", {
      device: FAKE_DEVICE_ID, src, srcRef: "1", dst, dstRef: "0",
    });

    expect(isError, text).toBe(false);
    expect(text).toContain('"Patch 2"');
    expect(text).toContain("patch 1 into");
    expect(text).toContain("patch 0.");
    const written = fakeDriver.parseFile(await readFile(dst), dst);
    expect(written.patches[0]?.name).toBe("Patch 2");
  });

  it("declares destructive, idempotent and non-open-world annotations and a title", async () => {
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("copy_patch") as {
      title?: string;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
    };

    expect(tool.title).toBeTruthy();
    expect(tool.annotations?.readOnlyHint).toBe(false);
    expect(tool.annotations?.destructiveHint).toBe(true);
    expect(tool.annotations?.idempotentHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});
