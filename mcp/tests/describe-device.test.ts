import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { connectClient } from "./helpers";

describe("describe_device", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("lists all groups plus a chain pointer when group is omitted", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "gx1" });

    expect(isError, text).toBe(false);
    const summary = JSON.parse(text) as {
      chain: { defaultOrder: string[]; help: string };
      groups: { id: string }[];
    };
    const groupIds = summary.groups.map(group => group.id);
    expect(groupIds).toContain("amp");
    expect(summary.chain.defaultOrder, "no-group summary carries a chain pointer").toContain("AMP");
    expect(summary.chain.help).toMatch(/chain/i);
  });

  it("returns the full chain model for group=chain", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "gx1", group: "chain" });

    expect(isError, text).toBe(false);
    const chain = JSON.parse(text) as { description: string; defaultOrder: string[] };
    expect(chain.defaultOrder, "chain view lists the default block order").toEqual(gx1.DEFAULT_CHAIN);
    expect(chain.description, "chain view explains bypass").toMatch(/on: false/);
    expect(chain.description, "chain view names the FV exception").toContain("FV");
  });

  it("returns full detail for a single group", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "amp" };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = JSON.parse(text) as { id: string; items: { id: string }[] };
    const itemIds = group.items.map(item => item.id);
    expect(group.id).toBe("amp");
    expect(itemIds).toContain("JC-120");
  });

  it("lists a group as an index — no per-item params, but subtype ids and a drill-down pointer", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "fx" };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = JSON.parse(text) as {
      help: string;
      items: { id: string; params?: unknown; subTypes?: string[] }[];
    };
    const chorus = group.items.find(item => item.id === "CHORUS");
    expect(group.items.every(item => item.params === undefined), "a listing carries no item params").toBe(true);
    expect(chorus?.subTypes, "subtypes are listed by id").toContain("STEREO");
    expect(group.help).toMatch(/includeParams/);
  });

  // The listing exists to be read in one call. Inlining every item's params put fx past 70k
  // characters, which some clients refuse outright — this is the ceiling that regression would hit.
  it("keeps the largest group's listing small enough to consume in one call", async () => {
    const client = await connectClient();
    close = client.close;

    const listing = await client.callTool("describe_device", { device: "gx1", group: "fx" });
    const full = await client.callTool("describe_device", { device: "gx1", group: "fx", includeParams: true });

    expect(listing.text.length, "an fx listing must stay browsable").toBeLessThan(20_000);
    expect(full.text.length, "includeParams still returns the full payload").toBeGreaterThan(50_000);
  });

  it("keeps the block-level controls in a group listing", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "amp" };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = JSON.parse(text) as { params: { name: string }[] };
    expect(group.params.map(param => param.name)).toContain("GAIN");
  });

  it("returns every item's params when includeParams is set", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "fx", includeParams: true };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = JSON.parse(text) as { items: { id: string; params?: { name: string }[] }[] };
    const chorus = group.items.find(item => item.id === "CHORUS");
    expect(chorus?.params?.map(param => param.name)).toContain("RATE");
  });

  it("includes the block's own controls when drilling into an item", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "amp", item: "JC-120" };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const item = JSON.parse(text) as { params: { name: string }[] };
    const paramNames = item.params.map(param => param.name);
    expect(paramNames, "amp's controls live on the group, not the item").toContain("GAIN");
    expect(paramNames).toContain("TREBLE");
  });

  it("returns full detail for a single item", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "amp", item: "jc-120" };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const item = JSON.parse(text) as { id: string };
    expect(item.id).toBe("JC-120");
  });

  it("errors for an unknown device", async () => {
    const client = await connectClient();
    close = client.close;

    const { isError, text } = await client.callTool("describe_device", { device: "nonexistent" });

    expect(isError).toBe(true);
    expect(text).toContain('Unknown device "nonexistent"');
  });

  it("errors for an unknown group", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "nonexistent" };

    const { isError, text } = await client.callTool("describe_device", input);

    expect(isError).toBe(true);
    expect(text).toContain('Unknown group "nonexistent"');
  });

  it("errors for an unknown item", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "amp", item: "nonexistent" };

    const { isError, text } = await client.callTool("describe_device", input);

    expect(isError).toBe(true);
    expect(text).toContain('Unknown item "nonexistent"');
  });

  it("stamps the machine key on each param (the generate/read field name)", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "fx", item: "CHORUS" };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const item = JSON.parse(text) as { params: { name: string; key?: string }[] };
    const preDelay = item.params.find(param => param.name === "PRE-DELAY");
    expect(preDelay?.key, "PRE-DELAY should carry its machine key").toBe("preDelay");
  });

  it("enumerates the exact valid labels for a frequency-lookup param", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", group: "delay", item: "STANDARD" };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const item = JSON.parse(text) as { params: { name: string; values?: string[] }[] };
    const highCut = item.params.find(param => param.name === "HIGH CUT");
    expect(highCut?.values, "HIGH CUT should surface its enumerated labels").toBeDefined();
    expect(highCut?.values).toContain("FLAT");
    expect(highCut?.values).toContain("2.5kHz");
  });
});
