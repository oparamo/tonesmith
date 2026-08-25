/**
 * The window this tool puts over a file, not what a decoded patch holds.
 *
 * Decoding, patch refs and the presented view are `@tonesmith/core`'s and are proven there. What
 * `read-patch.ts` owns is the paging: how many patches one call returns, where it starts, and how
 * a caller reaches the rest.
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { gx1 } from "@tonesmith/core";
import { connectClient, emptyTempDir, present, FIXTURE } from "./helpers";

const expected = gx1.driver.readFile(FIXTURE);

interface PageResponse {
  setName: string;
  total: number;
  offset: number;
  patches: { index: number; patch: { name: string } }[];
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
    const body = pageOf(text);
    expect(body.setName).toBe(expected.name);
    expect(body.patches).toHaveLength(expected.patches.length);
    const actualNames = body.patches.map(entry => entry.patch.name);
    const expectedNames = expected.patches.map(patch => patch.name);
    expect(actualNames).toEqual(expectedNames);
  });

  it("returns a single patch by numeric index", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, ref: "0" };

    const { text, isError } = await client.callTool("read_patch", input);

    expect(isError, text).toBe(false);
    const body = JSON.parse(text) as { index: number; patch: { name: string } };
    expect(body.index).toBe(0);
    expect(body.patch.name).toBe(present(expected.patches[0], "patch 0 of the fixture").name);
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

  // The envelope's keys are the tool's own, and the patch's keys are the device's. Nesting is what
  // keeps a block named `index` or `setName` from shadowing what the read reports.
  it("carries the patch under its own key rather than spread across the envelope", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, ref: "0" };

    const { text } = await client.callTool("read_patch", input);

    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["index", "patch", "setName"]);
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
    expect(body.patches.map(entry => entry.index)).toEqual(rest);
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

  // The one error case this tool needs: proof the handler's work runs inside `attempt`, so a
  // driver throw becomes a tool error rather than reaching the transport. Which refs and files the
  // driver refuses is core's, and it is proven there.
  it("answers a driver throw with an error rather than letting it escape", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: "/no/such/file.tsl" };

    const { isError } = await client.callTool("read_patch", input);

    expect(isError).toBe(true);
  });
});
