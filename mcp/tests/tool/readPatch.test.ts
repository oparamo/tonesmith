/**
 * The window this tool puts over a file, not what a decoded patch holds.
 *
 * Decoding and patch refs are `@tonesmith/core`'s and are proven there. What `readPatch.ts` owns
 * is the paging: how many patches one call returns, where it starts, and how a caller reaches the
 * rest.
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { connectClient, emptyTempDir, FAKE_DEVICE_ID } from "../helpers";

interface PageResponse {
  setName: string;
  total: number;
  offset: number;
  patches: { index: number; patch: { name: string } }[];
  nextOffset?: number;
}

const pageOf = (text: string): PageResponse => JSON.parse(text) as PageResponse;

type ConnectedClient = Awaited<ReturnType<typeof connectClient>>;

/** A fresh library file of `count` blank patches, through the fake driver. */
const library = async (client: ConnectedClient, count: number): Promise<{ file: string; cleanup: () => Promise<void> }> => {
  const temp = await emptyTempDir();
  const file = join(temp.dir, "library.tsl");
  await client.callTool("create_patch_file", { device: FAKE_DEVICE_ID, file, patchCount: count });
  return { file, cleanup: temp.cleanup };
};

describe("read_patch", () => {
  let close: () => Promise<void>;
  let cleanup: () => Promise<void> = () => Promise.resolve();
  afterEach(async () => { await close(); await cleanup(); });

  it("returns the whole file in one page when it fits under the default limit", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 3);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.total).toBe(3);
    expect(body.patches.map(entry => entry.patch.name)).toStrictEqual(["Patch 1", "Patch 2", "Patch 3"]);
    expect(body.nextOffset).toBeUndefined();
  });

  it("returns the whole envelope for a single-patch read, keyed apart from setName and index", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 2);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file, ref: "0" });

    expect(isError, text).toBe(false);
    expect(JSON.parse(text)).toStrictEqual({ setName: "library", index: 0, patch: { name: "Patch 1" } });
  });

  it("returns a bounded page of a large file, saying how many there are and how to reach the rest", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 25);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.total).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.patches.map(entry => entry.index)).toStrictEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(body.nextOffset).toBe(20);
  });

  it("reads the patches after `offset`, and says nothing more is left", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 2);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file, offset: 1 });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.offset).toBe(1);
    expect(body.patches.map(entry => entry.index)).toStrictEqual([1]);
    expect(body.nextOffset).toBeUndefined();
  });

  it("takes a `limit` under the default", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 3);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file, limit: 1 });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.patches).toHaveLength(1);
    expect(body.total).toBe(3);
    expect(body.nextOffset).toBe(1);
  });

  it("takes a `limit` of 100, the maximum, on a file that holds more", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 101);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file, limit: 100 });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.patches).toHaveLength(100);
    expect(body.nextOffset).toBe(100);
  });

  it("returns an empty page with no `nextOffset` when `offset` lands exactly on the end", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 5);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file, offset: 5 });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.patches).toStrictEqual([]);
    expect(body.nextOffset).toBeUndefined();
  });

  it("returns an empty page with no `nextOffset` when `offset` lands past the end", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 5);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file, offset: 50 });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.patches).toStrictEqual([]);
    expect(body.nextOffset).toBeUndefined();
  });

  it("carries no `nextOffset` when a page ends exactly on the last patch", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 5);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", { device: FAKE_DEVICE_ID, file, limit: 5 });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.patches).toHaveLength(5);
    expect(body.nextOffset).toBeUndefined();
  });

  it("ignores `limit` and `offset` when `ref` names a patch", async () => {
    const client = await connectClient();
    close = client.close;
    const { file, cleanup: temp } = await library(client, 5);
    cleanup = temp;

    const { text, isError } = await client.callTool("read_patch", {
      device: FAKE_DEVICE_ID, file, ref: "1", limit: 1, offset: 3,
    });

    expect(isError, text).toBe(false);
    expect(JSON.parse(text)).toStrictEqual({ setName: "library", index: 1, patch: { name: "Patch 2" } });
  });

  it("declares a `limit` and `offset` bound in its schema", async () => {
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("read_patch") as {
      inputSchema: { properties: { limit: { minimum: number; maximum: number }; offset: { minimum: number } } };
    };

    expect(tool.inputSchema.properties.limit.minimum).toBe(1);
    expect(tool.inputSchema.properties.limit.maximum).toBe(100);
    expect(tool.inputSchema.properties.offset.minimum).toBe(0);
  });

  it("declares readOnly and non-open-world annotations and a title", async () => {
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("read_patch") as {
      title?: string;
      annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
    };

    expect(tool.title).toBeTruthy();
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});

