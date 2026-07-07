import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { connectClient, withTempDir } from "./helpers";

describe("write_field", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof withTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("writes a numeric field to the file", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const { isError } = await client.callTool("write_field", {
      device: "gx1", file: temp.fixture, ref: "0", field: "amp.gain", value: "88",
    });
    expect(isError).toBe(false);
    expect(gx1.driver.readFile(temp.fixture).patches[0].amp.gain).toBe(88);
  });

  it("coerces a boolean field", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    await client.callTool("write_field", {
      device: "gx1", file: temp.fixture, ref: "0", field: "amp.solo", value: "true",
    });
    expect(gx1.driver.readFile(temp.fixture).patches[0].amp.solo).toBe(true);
  });

  it("errors for an unknown device", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const { isError, text } = await client.callTool("write_field", {
      device: "nonexistent", file: temp.fixture, ref: "0", field: "amp.gain", value: "1",
    });
    expect(isError).toBe(true);
    expect(text).toContain('Unknown device "nonexistent"');
  });

  it("errors for a bad ref", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const { isError, text } = await client.callTool("write_field", {
      device: "gx1", file: temp.fixture, ref: "No Such Patch", field: "amp.gain", value: "1",
    });
    expect(isError).toBe(true);
    expect(text).toContain('No patch named "No Such Patch"');
  });
});
