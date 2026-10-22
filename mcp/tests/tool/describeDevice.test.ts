/**
 * How this tool cuts the catalog up, not what the catalog says.
 *
 * The groups, types, params and examples are `@tonesmith/core`'s, and its drift guards are what
 * hold them to the codec. What `describeDevice.ts` owns is the shape of an answer: parsing an
 * entry, indexing a group against dumping it, the batch resolving or failing whole, and building
 * its own example `items` list from a device's own catalog.
 */
import { describe, it, expect, afterEach } from "vitest";
import { connectClient, fakeCapabilities, buildFakeDriver, present } from "../helpers";

buildFakeDriver("quirk-solo", { ...fakeCapabilities, groups: fakeCapabilities.groups.slice(0, 1) });

/** Pulls one entry's view out of a batched response, which is keyed by the requested entry string. */
const viewOf = (text: string, entry: string): unknown => (JSON.parse(text) as Record<string, unknown>)[entry];

describe("describe_device", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("lists all groups plus a chain pointer when items is omitted", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk" });

    expect(isError, text).toBe(false);
    const summary = JSON.parse(text) as { chain: { defaultOrder: string[] }; groups: { id: string }[] };
    expect(summary.groups.map(group => group.id)).toStrictEqual(fakeCapabilities.groups.map(group => group.id));
    expect(summary.chain.defaultOrder).toStrictEqual(fakeCapabilities.chain.defaultOrder);
  });

  it("answers `items: []` the same as omitting items", async () => {
    const client = await connectClient();
    close = client.close;

    const omitted = await client.callTool("describe_device", { device: "quirk" });
    const empty = await client.callTool("describe_device", { device: "quirk", items: [] });

    expect(empty.isError).toBe(false);
    expect(empty.text).toBe(omitted.text);
  });

  it("names every type in the summary, so the next call can be built from it alone", async () => {
    const client = await connectClient();
    close = client.close;

    const { text } = await client.callTool("describe_device", { device: "quirk" });
    const { groups } = JSON.parse(text) as { groups: { id: string; typeIds: string[] }[] };

    expect(groups.map(group => group.typeIds)).toStrictEqual(fakeCapabilities.groups.map(group => group.types.map(type => type.id)));
  });

  it("keeps the summary group shape to an index: no params, no type objects", async () => {
    const client = await connectClient();
    close = client.close;

    const { text } = await client.callTool("describe_device", { device: "quirk" });
    const { groups } = JSON.parse(text) as { groups: Record<string, unknown>[] };

    for (const group of groups) expect(Object.keys(group).sort()).toStrictEqual(["description", "id", "name", "typeIds"]);
  });

  it("builds its example items list from the device's own catalog, skipping a group with no types", async () => {
    const client = await connectClient();
    close = client.close;

    const { text } = await client.callTool("describe_device", { device: "quirk" });
    const { help } = JSON.parse(text) as { help: string };
    const entries = JSON.parse(help.slice(help.indexOf("["), help.lastIndexOf("]") + 1)) as string[];

    expect(entries).toStrictEqual(["chain", "core", "extra/X"]);
  });

  it("names only the chain and its one group in the example items list of a single-group device", async () => {
    const client = await connectClient();
    close = client.close;

    const { text } = await client.callTool("describe_device", { device: "quirk-solo" });
    const { help } = JSON.parse(text) as { help: string };
    const entries = JSON.parse(help.slice(help.indexOf("["), help.lastIndexOf("]") + 1)) as string[];

    expect(entries).toStrictEqual(["chain", "core"]);
  });

  it("resolves every requested entry in one call, keyed by the entry string", async () => {
    const client = await connectClient();
    close = client.close;
    const items = ["chain", "core", "extra/X", "core/ALPHA"];

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items });

    expect(isError, text).toBe(false);
    const views = JSON.parse(text) as Record<string, { id?: string; defaultOrder?: string[] }>;
    expect(Object.keys(views), "every requested entry comes back").toStrictEqual(items);
    const requested = (entry: string): { id?: string; defaultOrder?: string[] } =>
      present(views[entry], `the ${entry} view`);
    expect(requested("chain").defaultOrder).toStrictEqual(fakeCapabilities.chain.defaultOrder);
    expect(requested("core").id).toBe("core");
    expect(requested("extra/X").id).toBe("X");
    expect(requested("core/ALPHA").id).toBe("ALPHA");
  });

  it("answers the same entry listed twice under one key", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core", "core"] });

    expect(isError, text).toBe(false);
    expect(Object.keys(JSON.parse(text) as object)).toStrictEqual(["core"]);
  });

  // "BETA/GAMMA" is a real type id in the fake catalog, so an entry is split on its first slash only.
  it("resolves a type id that itself contains a slash", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core/BETA/GAMMA"] });

    expect(isError, text).toBe(false);
    expect((viewOf(text, "core/BETA/GAMMA") as { id: string }).id).toBe("BETA/GAMMA");
  });

  it("returns a group index for a bare group entry", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core"] });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "core") as { id: string; types: { id: string }[] };
    expect(group.id).toBe("core");
    expect(group.types.map(type => type.id)).toStrictEqual(["ALPHA", "BETA/GAMMA"]);
  });

  it("lists a group index with no per-type params", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core"] });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "core") as { types: { params?: unknown }[] };
    expect(group.types.every(type => type.params === undefined)).toBe(true);
  });

  it("lists a group index's types with their subTypes by id", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core"] });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "core") as { types: { id: string; subTypes?: string[] }[] };
    const betaGamma = present(group.types.find(type => type.id === "BETA/GAMMA"), "the BETA/GAMMA type");
    expect(betaGamma.subTypes).toStrictEqual(["ONE", "TWO"]);
  });

  it("keeps the block-level controls in a group listing", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core"] });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "core") as { params: { name: string }[] };
    expect(group.params.map(param => param.name)).toContain("level");
  });

  it("returns every type's params when includeParams is set", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core"], includeParams: true });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "core") as { types: { id: string; params?: { name: string }[] }[] };
    const alpha = present(group.types.find(type => type.id === "ALPHA"), "the ALPHA type");
    expect(alpha.params?.map(param => param.name)).toContain("gain");
  });

  it("ignores includeParams for a <group>/<type> entry", async () => {
    const client = await connectClient();
    close = client.close;

    const plain = await client.callTool("describe_device", { device: "quirk", items: ["core/ALPHA"] });
    const withFlag = await client.callTool("describe_device", { device: "quirk", items: ["core/ALPHA"], includeParams: true });

    expect(plain.text).toBe(withFlag.text);
  });

  it("includes the block's own controls when naming a type", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core/ALPHA"] });

    expect(isError, text).toBe(false);
    const view = viewOf(text, "core/ALPHA") as { params: { name: string }[] };
    const paramNames = view.params.map(param => param.name);
    expect(paramNames, "core's block-level controls live ahead of the type's own").toContain("level");
    expect(paramNames).toContain("gain");
  });

  it("carries a copyable spec example on a named type", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core/ALPHA"] });

    expect(isError, text).toBe(false);
    const view = viewOf(text, "core/ALPHA") as { example: unknown };
    expect(view.example).toStrictEqual(present(fakeCapabilities.groups[0]?.types[0], "ALPHA").example);
  });

  it("carries the example on a group with no types, its only view", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["solo"] });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "solo") as { example: unknown };
    expect(group.example).toStrictEqual(present(fakeCapabilities.groups[2], "solo").example);
  });

  it("keeps the example on a group with no types even under includeParams", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["solo"], includeParams: true });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "solo") as { example: unknown };
    expect(group.example).toStrictEqual(present(fakeCapabilities.groups[2], "solo").example);
  });

  it("carries no example on a group index whose types carry their own", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core"] });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "core") as { example?: unknown; types: { example?: unknown }[] };
    expect(group.example).toBeUndefined();
    expect(group.types.every(type => type.example === undefined)).toBe(true);
  });

  it("strips each type's example from an includeParams dump", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("describe_device", { device: "quirk", items: ["core"], includeParams: true });

    expect(isError, text).toBe(false);
    const group = viewOf(text, "core") as { types: { example?: unknown }[] };
    expect(group.types.every(type => type.example === undefined)).toBe(true);
  });

  it("fails the whole batch when any one entry is bad, naming that entry", async () => {
    const client = await connectClient();
    close = client.close;

    const { isError, text } = await client.callTool("describe_device", {
      device: "quirk", items: ["core", "extra/NOPE", "solo"],
    });

    expect(isError).toBe(true);
    expect(text).toContain('items entry "extra/NOPE"');
    expect(text, "no partial payload comes back alongside the error").not.toContain('"solo"');
  });

  it("declares readOnly and non-open-world annotations and a title", async () => {
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("describe_device") as {
      title?: string;
      annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
    };

    expect(tool.title).toBeTruthy();
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});
