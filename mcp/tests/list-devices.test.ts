import { describe, it, expect, afterEach } from "vitest";
import { connectClient } from "./helpers";

describe("list_devices", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("includes gx1", async () => {
    const client = await connectClient();
    close = client.close;
    const { text, isError } = await client.callTool("list_devices", {});
    expect(isError, text).toBe(false);
    const devices = JSON.parse(text) as { id: string; name: string }[];
    expect(devices.map(d => d.id)).toContain("gx1");
  });
});
