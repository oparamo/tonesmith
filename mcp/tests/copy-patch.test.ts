/**
 * A pass-through to `patchUtils.copyPatch`, so there is little here that is the tool's own.
 * Resolving either ref, replacing the slot, and refusing an index past the end are
 * `@tonesmith/core`'s and are proven in `core/tests/patch-utils.test.ts`. What is left is that the
 * tool reaches the driver at all, and that a driver throw comes back as a tool error.
 */
import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { join } from "node:path";
import { connectClient, withTempDir, patchAt, present } from "./helpers";

describe("copy_patch", () => {
  let close: () => Promise<void>;
  let cleanup: () => void = () => { /* set per test */ };
  afterEach(async () => { await close(); cleanup(); });

  it("copies through the driver and leaves the destination file readable", async () => {
    const temp = withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const destination = join(temp.dir, "destination.tsl");
    gx1.driver.writeFile(gx1.driver.newFile("destination", 1), destination);
    const sourceName = patchAt(temp.fixture).name;

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: temp.fixture, srcRef: "0", dst: destination, dstRef: "0",
    });

    expect(result.isError).toBe(false);
    expect(patchAt(destination).name).toBe(sourceName);
    expect(present(gx1.driver.readFile(destination).patches, "the destination's patches")).toHaveLength(1);
  });

  it("answers a driver throw with an error rather than letting it escape", async () => {
    const temp = withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: join(temp.dir, "missing.tsl"), srcRef: "0", dst: temp.fixture, dstRef: "0",
    });

    expect(result.isError).toBe(true);
  });
});
