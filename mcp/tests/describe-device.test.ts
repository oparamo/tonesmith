/**
 * How this tool cuts the catalog up, not what the catalog says.
 *
 * The groups, types, params and examples are `@tonesmith/core`'s, and its drift guards are what
 * hold them to the codec. What `describe-device.ts` owns is the shape of an answer: parsing an
 * entry, indexing a group against dumping it, the batch resolving or failing whole, and the two
 * size budgets a client imposes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import type { ParamSpec } from "@tonesmith/core";
import { connectClient, present } from "./helpers";

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
    expect(summary.chain.defaultOrder, "no-items summary carries a chain pointer").toContain("amp");
  });

  // Every id an `items` entry can name comes from here, so a caller writes the next call off this
  // response alone rather than listing each group first.
  it("names every type in the summary, so the next call can be built from it alone", async () => {
    const client = await connectClient();
    close = client.close;

    const { text } = await client.callTool("describe_device", { device: "gx1" });
    const { groups } = JSON.parse(text) as { groups: { id: string; typeIds: string[] }[] };
    const amp = present(groups.find(group => group.id === "amp"), "the amp group");
    const [firstType] = amp.typeIds;

    const named = `amp/${present(firstType, "amp's first type id")}`;
    const { text: reply, isError } = await client.callTool("describe_device", { device: "gx1", items: [named] });

    expect(isError, reply).toBe(false);
    const view = viewOf(reply, named) as { id: string; params: ParamSpec[] };
    expect(view.id, "an id read out of the summary resolves as an entry").toBe(firstType);
    expect(view.params.length, "and answers with the params the summary could not carry").toBeGreaterThan(0);
  });

  // The whole reason the ids fit here: they are the cheap half of a listing. Held as a ratio so
  // that reformatting the response cannot turn this into an assertion about byte counts.
  it("keeps the summary far cheaper than listing every group", async () => {
    const client = await connectClient();
    close = client.close;
    const everyGroup = gx1.driver.capabilities.groups.map(group => group.id);

    const summary = await client.callTool("describe_device", { device: "gx1" });
    const listings = await client.callTool("describe_device", { device: "gx1", items: everyGroup });

    expect(summary.text.length, "the ids are the cheap half of a listing")
      .toBeLessThan(listings.text.length / 4);
  });

  // The example has to come from the catalog the call is answering about. Any hand-written list
  // names groups and types that exist on one device and not on the next.
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

  // The settings belong to no group, so this entry is the only one that can carry them. Dropping
  // them from it makes a device's tempo undiscoverable without ever failing a call.
  it("carries the settings the patch itself holds on the chain entry", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "gx1", items: ["chain"] });

    expect(isError, text).toBe(false);
    const chain = viewOf(text, "chain") as { patchSettings: { key: string }[] };
    expect(chain.patchSettings).toEqual(gx1.driver.capabilities.patchSettings);
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
    const requested = (entry: string): { id?: string; defaultOrder?: string[] } =>
      present(views[entry], `the ${entry} view`);
    expect(requested("chain").defaultOrder).toEqual(gx1.driver.capabilities.chain.defaultOrder);
    expect(requested("amp").id).toBe("amp");
    expect(requested("fx/CHORUS").id).toBe("CHORUS");
    expect(requested("reverb/HALL M").id).toBe("HALL M");
    expect(requested("delay/ANALOG").id).toBe("ANALOG");
  });

  // "OD/DS" is a real fx effect type, so an entry is split on its FIRST slash only.
  it("resolves a type id that itself contains a slash", async () => {
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
    const group = viewOf(text, "amp") as { id: string; types: { id: string }[] };
    const typeIds = group.types.map(capType => capType.id);
    expect(group.id).toBe("amp");
    expect(typeIds).toContain("JC-120");
  });

  it("lists a group as an index: no per-type params, but subtype ids", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["fx"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "fx") as { types: { id: string; params?: unknown; subTypes?: string[] }[] };
    const chorus = group.types.find(capType => capType.id === "CHORUS");
    expect(group.types.every(capType => capType.params === undefined), "a listing carries no type params").toBe(true);
    expect(chorus?.subTypes, "subtypes are listed by id").toContain("STEREO");
  });

  // The listing exists to be read in one call, and inlining every type's params pushes fx past 70k
  // characters, which some clients refuse outright. The full/listing comparison is a ratio rather
  // than a byte count, so changing how the response is serialized cannot quietly turn this guard
  // into a formatting assertion.
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
      "chain", "amp", "drive",
      "fx/COMPRESSOR", "fx/ENHANCER", "fx/HIGH GEQ", "fx/CHORUS", "fx/ROTARY", "fx/SCRIPT PH",
      "fx/FLANGER", "fx/PHASER", "fx/TREMOLO", "fx/CLASSIC-VIBE", "fx/VIBRATO",
      "drive/MUFF FUZZ", "drive/60S FUZZ", "drive/BLUES OD", "drive/T-SCREAM", "drive/TREBLE BST",
      "drive/LEAD DS",
      "delay/ANALOG", "delay/STANDARD", "delay/MODULATE",
      "reverb/HALL M", "reverb/HALL S", "reverb/ROOM S", "reverb/PLATE", "reverb/SHIMMER",
      "noiseGate", "volume",
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

  it("returns every type's params when includeParams is set", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["fx"], includeParams: true };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "fx") as { types: { id: string; params?: { name: string }[] }[] };
    const chorus = group.types.find(capType => capType.id === "CHORUS");
    expect(chorus?.params?.map(param => param.name)).toContain("RATE");
  });

  it("includes the block's own controls when naming a type", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp/JC-120"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const view = viewOf(text, "amp/JC-120") as { params: { name: string }[] };
    const paramNames = view.params.map(param => param.name);
    expect(paramNames, "amp's controls live on the group, not the type").toContain("GAIN");
    expect(paramNames).toContain("TREBLE");
  });

  it("carries a copyable spec example on a named type", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp/JC-120", "fx/CHORUS"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const amp = viewOf(text, "amp/JC-120") as { example: { amp: { type: string; params: Record<string, unknown> } } };
    const fx = viewOf(text, "fx/CHORUS") as { example: { fx1: { params: Record<string, unknown> } } };
    expect(amp.example.amp.type, "the example selects the type it was asked about").toBe("JC-120");
    expect(amp.example.amp.params.gain, "with its controls under params, like every block").toBeDefined();
    expect(fx.example.fx1.params.rate, "including an fx slot").toBeDefined();
  });

  it("carries the example on a group with no types, its only view", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["noiseGate"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    const group = viewOf(text, "noiseGate") as { example: { noiseGate: { params: Record<string, unknown> } } };
    expect(group.example.noiseGate.params.threshold).toBeDefined();
  });

  it("leaves examples out of a group index and its full dump", async () => {
    const client = await connectClient();
    close = client.close;
    const index = { device: "gx1", items: ["fx"] };
    const full = { device: "gx1", items: ["fx"], includeParams: true };

    const indexed = await client.callTool("describe_device", index);
    const dumped = await client.callTool("describe_device", full);

    const indexView = viewOf(indexed.text, "fx") as { example?: unknown; types: { example?: unknown }[] };
    const fullView = viewOf(dumped.text, "fx") as { types: { example?: unknown }[] };
    expect(indexView.example, "a group with types shows examples on its types").toBeUndefined();
    expect(indexView.types.every(capType => capType.example === undefined)).toBe(true);
    expect(fullView.types.every(capType => capType.example === undefined)).toBe(true);
  });

  it("resolves a type id case-insensitively", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp/jc-120"] };

    const { text, isError } = await client.callTool("describe_device", input);

    expect(isError, text).toBe(false);
    expect((viewOf(text, "amp/jc-120") as { id: string }).id).toBe("JC-120");
  });

  // Atomic like write_fields: a partially resolved batch would leave the caller to spot the hole.
  // Also the tool's one error case: proof the work runs inside `attempt`, so a lookup throw comes
  // back as a tool error. Which ids resolve is core's, and its lookups are proven there.
  it("fails the whole batch when any one entry is bad", async () => {
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", items: ["amp", "fx/NOPE", "reverb/HALL M"] };

    const { isError, text } = await client.callTool("describe_device", input);

    expect(isError).toBe(true);
    expect(text, "no partial payload comes back alongside the error").not.toContain('"HALL M"');
  });

});
