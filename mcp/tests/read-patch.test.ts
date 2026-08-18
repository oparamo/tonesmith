import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { gx1 } from "@tonesmith/core";
import { connectClient, emptyTempDir, present, FIXTURE } from "./helpers";

const expected = gx1.driver.readFile(FIXTURE);

interface PageResponse {
  setName: string;
  total: number;
  offset: number;
  patches: { index: number; name: string }[];
  more?: string;
}

const pageOf = (text: string): PageResponse => JSON.parse(text) as PageResponse;

describe("read_patch", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("returns every patch when ref is omitted", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE };

    const { text, isError } = await client.callTool("read_patch", input);

    expect(isError, text).toBe(false);
    const body = JSON.parse(text) as { setName: string; patches: { index: number; name: string }[] };
    expect(body.setName).toBe(expected.name);
    expect(body.patches).toHaveLength(expected.patches.length);
    const actualNames = body.patches.map(patch => patch.name);
    const expectedNames = expected.patches.map(patch => patch.name);
    expect(actualNames).toEqual(expectedNames);
  });

  it("returns a single patch by numeric index", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, ref: "0" };

    const { text, isError } = await client.callTool("read_patch", input);

    expect(isError, text).toBe(false);
    const body = JSON.parse(text) as { index: number; name: string };
    expect(body.index).toBe(0);
    expect(body.name).toBe(present(expected.patches[0], "patch 0 of the fixture").name);
  });

  // The all-patches read carries setName; this guards that a single-patch read does too, so the
  // caller can see the set they are working in, or confirm a rename landed.
  it("reports the set name on a single-patch read too", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, ref: "0" };

    const { text } = await client.callTool("read_patch", input);

    const body = JSON.parse(text) as { setName: string };
    expect(body.setName).toBe(expected.name);
  });

  // A device library runs to hundreds of patches at roughly 1.4 KB each decoded, which is a
  // response no caller asked for and some clients refuse outright.
  it("returns a bounded page of a large file, saying how many there are and how to reach the rest", async () => {
    const temp = emptyTempDir();
    const file = join(temp.dir, "library.tsl");
    const client = await connectClient();
    close = async () => { await client.close(); temp.cleanup(); };
    await client.callTool("create_patch_file", { device: "gx1", file, patchCount: 25 });

    const { text, isError } = await client.callTool("read_patch", { device: "gx1", file });

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.total).toBe(25);
    expect(body.offset).toBe(0);
    expect(body.patches.length).toBeLessThan(25);
    expect(body.more, "says how to reach the patches it left out").toBeDefined();
  });

  it("reads the patches after `offset`, and says nothing more is left", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, offset: 1 };

    const { text, isError } = await client.callTool("read_patch", input);

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.offset).toBe(1);
    const rest = expected.patches.map((_, index) => index).slice(1);
    expect(body.patches.map(patch => patch.index)).toEqual(rest);
    expect(body.more).toBeUndefined();
  });

  it("takes a `limit` under the default", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, limit: 1 };

    const { text, isError } = await client.callTool("read_patch", input);

    expect(isError, text).toBe(false);
    const body = pageOf(text);
    expect(body.patches).toHaveLength(1);
    expect(body.total).toBe(expected.patches.length);
    expect(body.more).toBeDefined();
  });

  it("errors for an unknown device", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "nonexistent", file: FIXTURE };

    const { isError } = await client.callTool("read_patch", input);

    expect(isError).toBe(true);
  });

  it("errors for a missing file", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: "/no/such/file.tsl" };

    const { isError } = await client.callTool("read_patch", input);

    expect(isError).toBe(true);
  });

  it("errors for a bad ref", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, ref: "No Such Patch" };

    const { isError } = await client.callTool("read_patch", input);

    expect(isError).toBe(true);
  });
});
