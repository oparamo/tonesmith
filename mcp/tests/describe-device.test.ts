import { describe, it, expect, afterEach } from "vitest";
import { connectClient } from "./helpers";

describe("describe_device", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("lists all groups when group is omitted", async () => {
    const client = await connectClient();
    close = client.close;
    const { text, isError } = await client.callTool("describe_device", { device: "gx1" });
    expect(isError, text).toBe(false);
    const groups = JSON.parse(text) as { id: string }[];
    const groupIds = groups.map(group => group.id);
    expect(groupIds).toContain("amp");
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
});
