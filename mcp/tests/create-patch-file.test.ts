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

  it("names the set after the file when setName is omitted", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "my-tones.tsl");

    await client.callTool("create_patch_file", { device: "gx1", file: path });

    expect(gx1.driver.readFile(path).name).toBe("my-tones");
  });

  it("uses setName for the set label when given", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "my-tones.tsl");

    await client.callTool("create_patch_file", { device: "gx1", file: path, setName: "Live Set" });

    expect(gx1.driver.readFile(path).name).toBe("Live Set");
  });

  it("creates missing parent directories", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "nested", "deeper", "fresh.tsl");

    const result = await client.callTool("create_patch_file", { device: "gx1", file: path });

    expect(result.isError).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  it("refuses to overwrite an existing file, leaving its patches intact", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const path = join(temp.dir, "taken.tsl");
    gx1.driver.writeFile(gx1.driver.newFile("taken", 4), path);

    const result = await client.callTool("create_patch_file", { device: "gx1", file: path });

    expect(result.isError).toBe(true);
    expect(gx1.driver.readFile(path).patches).toHaveLength(4);
  });

  it("errors for an unknown device", async () => {
    const temp = emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;

    const result = await client.callTool("create_patch_file", {
      device: "nope", file: join(temp.dir, "fresh.tsl"),
    });

    expect(result.isError).toBe(true);
  });
});
