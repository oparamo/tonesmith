import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { connectClient, FIXTURE } from "./helpers";

const expected = gx1.driver.readFile(FIXTURE);

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
    expect(body.name).toBe(expected.patches[0].name);
  });

  // The all-patches read has always carried setName; a single-patch read left the caller unable to
  // see the set they were working in, or to confirm a rename landed.
  it("reports the set name on a single-patch read too", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: FIXTURE, ref: "0" };

    const { text } = await client.callTool("read_patch", input);

    const body = JSON.parse(text) as { setName: string };
    expect(body.setName).toBe(expected.name);
  });

  it("errors for an unknown device", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "nonexistent", file: FIXTURE };

    const { isError, text } = await client.callTool("read_patch", input);

    expect(isError).toBe(true);
    expect(text).toContain('Unknown device "nonexistent"');
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

    const { isError, text } = await client.callTool("read_patch", input);

    expect(isError).toBe(true);
    expect(text).toContain('No patch named "No Such Patch"');
  });
});
