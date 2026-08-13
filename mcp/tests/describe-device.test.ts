import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { connectClient } from "./helpers";

/** Pulls one entry's view out of a batched response, which is keyed by the requested entry string. */
const viewOf = (text: string, entry: string): unknown => (JSON.parse(text) as Record<string, unknown>)[entry];

describe("describe_device", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("lists all groups plus a chain pointer when items is omitted", async () => {
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
    expect(summary.chain.defaultOrder, "no-items summary carries a chain pointer").toContain("AMP");
  });

  // The summary's example was written out by hand against one device, so on any other it would name
  // groups and items that do not exist.
  it("shows an example `items` list built from this device's own catalog", async () => {
    const client = await connectClient();
    close = client.close;

    const { text } = await client.callTool("describe_device", { device: "gx1" });
    const { help } = JSON.parse(text) as { help: string };
    const entries = JSON.parse(help.slice(help.indexOf("["), help.lastIndexOf("]") + 1)) as string[];

    const { isError, text: reply } = await client.callTool("describe_device", { device: "gx1", items: entries });

    expect(entries.length, help).toBeGreaterThan(1);
    expect(isError, reply).toBe(false);
    expect(Object.keys(JSON.parse(reply) as object)).toEqual(entries);
  });

  it("returns the full chain model for the chain entry", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "gx1", items: ["chain"] });

    expect(isError, text).toBe(false);
    const chain = viewOf(text, "chain") as { defaultOrder: string[] };
    expect(chain.defaultOrder, "chain view lists the default block order").toEqual(gx1.driver.capabilities.chain.defaultOrder);
  });

  // The whole point of the batch form: a patch's worth of lookups in one round trip.
  it("resolves every requested entry in one call, keyed by the entry string", async () => {
    const client = await connectClient();
    close = client.close;
    const items = ["chain", "amp", "fx/CHORUS", "reverb/HALL M", "delay/ANALOG"];

    const { text, isError } = await client.callTool("describe_device", { device: "gx1", items });

    expect(isError, text).toBe(false);
    const views = JSON.parse(text) as Record<string, { id?: string; defaultOrder?: string[] }>;
    expect(Object.keys(views), "every requested entry comes back").toEqual(items);
    expect(views.chain.defaultOrder).toEqual(gx1.driver.capabilities.chain.defaultOrder);
    expect(views.amp.id).toBe("amp");
    expect(views["fx/CHORUS"].id).toBe("CHORUS");
    expect(views["reverb/HALL M"].id).toBe("HALL M");
    expect(views["delay/ANALOG"].id).toBe("ANALOG");
  });

  // "OD/DS" is a real fx effect type, so an entry is split on its FIRST slash only.
  it("resolves an item id that itself contains a slash", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "gx1", items: ["fx/OD/DS"] });

    expect(isError, text).toBe(false);
    expect((viewOf(text, "fx/OD/DS") as { id: string }).id).toBe("OD/DS");
  });

  it("returns a group index for a bare group entry", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "amp") as { id: string; items: { id: string }[] };
    const itemIds = group.items.map(item => item.id);
    expect(group.id).toBe("amp");
    expect(itemIds).toContain("JC-120");
  });

  it("lists a group as an index: no per-item params, but subtype ids", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["fx"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "fx") as { items: { id: string; params?: unknown; subTypes?: string[] }[] };
    const chorus = group.items.find(item => item.id === "CHORUS");
    expect(group.items.every(item => item.params === undefined), "a listing carries no item params").toBe(true);
    expect(chorus?.subTypes, "subtypes are listed by id").toContain("STEREO");
  });

  // The listing exists to be read in one call. Inlining every item's params put fx past 70k
  // characters, which some clients refuse outright. This is the ceiling that regression would hit.
  // The full/listing comparison is a ratio rather than a byte count so that changing how the
  // response is serialized can't quietly turn this guard into a formatting assertion.
  it("keeps the largest group's listing small enough to consume in one call", async () => {
    const client = await connectClient();
    close = client.close;

    const listing = await client.callTool("describe_device", { device: "gx1", items: ["fx"] });
    const full = await client.callTool("describe_device", { device: "gx1", items: ["fx"], includeParams: true });

    expect(listing.text.length, "an fx listing must stay browsable").toBeLessThan(20_000);
    expect(full.text.length, "includeParams still returns the full payload")
      .toBeGreaterThan(listing.text.length * 2);
  });

  // A client persists any tool result over 25,000 tokens to a file, then refuses to read that file
  // back for exceeding the same limit, so an oversized response is not merely verbose, it is
  // unrecoverable. These 30 entries are a whole library's worth of lookups, the scale the server's
  // instructions tell agents to batch for. The budget is in bytes because the token count is a
  // client-side measure this suite cannot see; 45 KB stays under 25k tokens at any plausible ratio.
  it("keeps a library-scale batch under the client's response ceiling", async () => {
    const client = await connectClient();
    close = client.close;
    const items = [
      "chain", "amp", "odds",
      "fx/COMPRESSOR", "fx/ENHANCER", "fx/HIGH GEQ", "fx/CHORUS", "fx/ROTARY", "fx/SCRIPT PH",
      "fx/FLANGER", "fx/PHASER", "fx/TREMOLO", "fx/CLASSIC-VIBE", "fx/VIBRATO",
      "odds/MUFF FUZZ", "odds/60S FUZZ", "odds/BLUES OD", "odds/T-SCREAM", "odds/TREBLE BST",
      "odds/LEAD DS",
      "delay/ANALOG", "delay/STANDARD", "delay/MODULATE",
      "reverb/HALL M", "reverb/HALL S", "reverb/ROOM S", "reverb/PLATE", "reverb/SHIMMER",
      "ns", "fv",
    ];

    const { text, isError } = await client.callTool("describe_device", { device: "gx1", items });

    expect(isError, text).toBe(false);
    const views = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(views), "every entry still resolves").toHaveLength(items.length);
    expect(text.length, "a whole library's lookups must fit in one response").toBeLessThan(45_000);
  });

  it("keeps the block-level controls in a group listing", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "amp") as { params: { name: string }[] };
    expect(group.params.map(param => param.name)).toContain("GAIN");
  });

  it("returns every item's params when includeParams is set", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["fx"], includeParams: true };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "fx") as { items: { id: string; params?: { name: string }[] }[] };
    const chorus = group.items.find(item => item.id === "CHORUS");
    expect(chorus?.params?.map(param => param.name)).toContain("RATE");
  });

  it("includes the block's own controls when naming an item", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp/JC-120"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const item = viewOf(text, "amp/JC-120") as { params: { name: string }[] };
    const paramNames = item.params.map(param => param.name);
    expect(paramNames, "amp's controls live on the group, not the item").toContain("GAIN");
    expect(paramNames).toContain("TREBLE");
  });

  it("carries a copyable spec example on a named item", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp/JC-120", "fx/CHORUS"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const amp = viewOf(text, "amp/JC-120") as { example: { amp: Record<string, unknown> } };
    const fx = viewOf(text, "fx/CHORUS") as { example: { fx1: Record<string, unknown> } };
    expect(amp.example.amp.type, "the example selects the item it was asked about").toBe("JC-120");
    expect(amp.example.amp.gain, "amp carries its controls flat").toBeDefined();
    expect(fx.example.fx1.params, "an fx slot nests its controls").toBeDefined();
  });

  it("carries the example on a group with no types, its only view", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["ns"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "ns") as { example: { ns: Record<string, unknown> } };
    expect(group.example.ns.threshold).toBeDefined();
  });

  it("leaves examples out of a group index and its full dump", async () => {
    const client = await connectClient();
    close = client.close;
    const index = { device: "gx1", items: ["fx"] };
    const full = { device: "gx1", items: ["fx"], includeParams: true };

    const indexed = await client.callTool("describe_device", index);
    const dumped = await client.callTool("describe_device", full);

    const indexView = viewOf(indexed.text, "fx") as { example?: unknown; items: { example?: unknown }[] };
    const fullView = viewOf(dumped.text, "fx") as { items: { example?: unknown }[] };
    expect(indexView.example, "a group with types shows examples on its items").toBeUndefined();
    expect(indexView.items.every(item => item.example === undefined)).toBe(true);
    expect(fullView.items.every(item => item.example === undefined)).toBe(true);
  });

  it("resolves an item id case-insensitively", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp/jc-120"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    expect((viewOf(text, "amp/jc-120") as { id: string }).id).toBe("JC-120");
  });

  it("errors for an unknown device", async () => {
    const client = await connectClient();
    close = client.close;

    const { isError } = await client.callTool("describe_device", { device: "nonexistent" });

    expect(isError).toBe(true);
  });

  it("errors for an unknown group", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["nonexistent"] };

    const { isError } = await client.callTool("describe_device", input);

    expect(isError).toBe(true);
  });

  it("errors for an unknown item", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp/nonexistent"] };

    const { isError } = await client.callTool("describe_device", input);

    expect(isError).toBe(true);
  });

  // Atomic like write_fields: a partially resolved batch would leave the caller to spot the hole.
  it("fails the whole batch when any one entry is bad", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp", "fx/NOPE", "reverb/HALL M"] };

    const { isError, text } = await client.callTool("describe_device", input);

    expect(isError).toBe(true);
    expect(text, "no partial payload comes back alongside the error").not.toContain('"HALL M"');
  });

  it("stamps the machine key on each param (the generate/read field name)", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["fx/CHORUS"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const item = viewOf(text, "fx/CHORUS") as { params: { name: string; key?: string }[] };
    const preDelay = item.params.find(param => param.name === "PRE-DELAY");
    expect(preDelay?.key, "PRE-DELAY should carry its machine key").toBe("preDelay");
  });

  it("enumerates the exact valid labels for a frequency-lookup param", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["delay/STANDARD"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const item = viewOf(text, "delay/STANDARD") as { params: { name: string; values?: string[] }[] };
    const highCut = item.params.find(param => param.name === "HIGH CUT");
    expect(highCut?.values, "HIGH CUT should surface its enumerated labels").toBeDefined();
    expect(highCut?.values).toContain("FLAT");
    expect(highCut?.values).toContain("2.5kHz");
  });
});
