import { describe, it, expect, afterEach } from "vitest";
import { registry } from "@tonesmith/core";
import { connectClient } from "../helpers";

describe("list_devices", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("lists every registered driver's id and name", async () => {
    const client = await connectClient();
    close = client.close;

    const { text, isError } = await client.callTool("list_devices", {});

    expect(isError, text).toBe(false);
    expect(JSON.parse(text)).toStrictEqual(registry.listDrivers().map(({ id, name }) => ({ id, name })));
  });

  it("declares readOnly and non-open-world annotations and a title", async () => {
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("list_devices") as {
      title?: string;
      annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
    };

    expect(tool.title).toBeTruthy();
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});
