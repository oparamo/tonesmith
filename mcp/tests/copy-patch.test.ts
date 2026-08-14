import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { join } from "node:path";
import { connectClient, withTempDir, patchAt, present } from "./helpers";

describe("copy_patch", () => {
  let close: () => Promise<void>;
  let cleanup: () => void = () => { /* set per test */ };
  afterEach(async () => { await close(); cleanup(); });

  it("replaces the destination patch with the source patch", async () => {
    const temp = withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const before = gx1.driver.readFile(temp.fixture);

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: temp.fixture, srcRef: "0", dst: temp.fixture, dstRef: "1",
    });

    expect(result.isError).toBe(false);
    const after = gx1.driver.readFile(temp.fixture);
    expect(present(after.patches[1], "the copy's destination slot").name)
      .toBe(present(before.patches[0], "the copy's source slot").name);
    expect(after.patches).toHaveLength(before.patches.length);
  });

  it("copies between two different files", async () => {
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
  });

  it("resolves the source by patch name", async () => {
    const temp = withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const named = patchAt(temp.fixture, 2).name;

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: temp.fixture, srcRef: named, dst: temp.fixture, dstRef: "0",
    });

    expect(result.isError).toBe(false);
    expect(patchAt(temp.fixture).name).toBe(named);
  });

  // An unchecked index would write past the end of the array, and the hole that leaves encodes as
  // a corrupt file rather than failing.
  it("rejects a destination index past the end of the file, leaving it untouched", async () => {
    const temp = withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const before = gx1.driver.readFile(temp.fixture);

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: temp.fixture, srcRef: "0", dst: temp.fixture, dstRef: "99",
    });

    expect(result.isError).toBe(true);
    expect(gx1.driver.readFile(temp.fixture).patches).toHaveLength(before.patches.length);
  });

  it("errors for a source file that doesn't exist", async () => {
    const temp = withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;

    const result = await client.callTool("copy_patch", {
      device: "gx1", src: join(temp.dir, "missing.tsl"), srcRef: "0", dst: temp.fixture, dstRef: "0",
    });

    expect(result.isError).toBe(true);
  });

  it("errors for an unknown device", async () => {
    const temp = withTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;

    const result = await client.callTool("copy_patch", {
      device: "nope", src: temp.fixture, srcRef: "0", dst: temp.fixture, dstRef: "1",
    });

    expect(result.isError).toBe(true);
  });
});
