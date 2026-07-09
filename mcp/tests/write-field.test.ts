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

    const input = { device: "gx1", file: temp.fixture, ref: "0", field: "amp.gain", value: "88" };
    const { isError } = await client.callTool("write_field", input);
    expect(isError).toBe(false);
    expect(gx1.driver.readFile(temp.fixture).patches[0].amp.gain).toBe(88);
  });

  it("coerces a boolean field", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const input = { device: "gx1", file: temp.fixture, ref: "0", field: "amp.solo", value: "true" };
    await client.callTool("write_field", input);
    expect(gx1.driver.readFile(temp.fixture).patches[0].amp.solo).toBe(true);
  });

  it("errors for an unknown device", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const input = { device: "nonexistent", file: temp.fixture, ref: "0", field: "amp.gain", value: "1" };
    const { isError, text } = await client.callTool("write_field", input);
    expect(isError).toBe(true);
    expect(text).toContain('Unknown device "nonexistent"');
  });

  it("errors for a bad ref", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const input = { device: "gx1", file: temp.fixture, ref: "No Such Patch", field: "amp.gain", value: "1" };
    const { isError, text } = await client.callTool("write_field", input);
    expect(isError).toBe(true);
    expect(text).toContain('No patch named "No Such Patch"');
  });

  it("writes a lookup field by label and reads it back as that label", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const input = { device: "gx1", file: temp.fixture, ref: "0", field: "delay.highCut", value: "2.5kHz" };
    const { isError } = await client.callTool("write_field", input);
    expect(isError).toBe(false);
    expect(gx1.driver.readFile(temp.fixture).patches[0].delay.highCut).toBe("2.5kHz");
  });

  it("surfaces the codec's error for a label not in the field's table", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const input = { device: "gx1", file: temp.fixture, ref: "0", field: "delay.highCut", value: "2.6kHz" };
    const { isError, text } = await client.callTool("write_field", input);
    expect(isError).toBe(true);
    expect(text).toContain('Unknown highCut value: "2.6kHz"');
  });
});
