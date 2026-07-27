import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { connectClient, withTempDir } from "./helpers";

describe("write_fields", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof withTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("writes a numeric field to the file", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "amp.gain": "88" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(false);
    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].amp.gain).toBe(88);
  });

  it("applies every field in one call", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const fields = { "amp.gain": "77", "ns.threshold": "31", "delay.highCut": "2.5kHz", key: "G" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(temp.fixture).patches[0];
    expect(patch.amp.gain).toBe(77);
    expect(patch.ns.threshold).toBe(31);
    expect(patch.delay.highCut).toBe("2.5kHz");
    expect(patch.key).toBe("G");
  });

  it("echoes every applied edit", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const fields = { "amp.gain": "64", "amp.bass": "40" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { text } = await client.callTool("write_fields", input);

    expect(text).toContain("amp.gain = 64");
    expect(text).toContain("amp.bass = 40");
  });

  it("writes nothing when any field in the batch is rejected", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const before = gx1.driver.readFile(temp.fixture).patches[0].amp.gain;
    const fields = { "amp.gain": "99", "delay.highCut": "2.6kHz" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
    expect(text).toContain('Unknown highCut value: "2.6kHz"');
    const after = gx1.driver.readFile(temp.fixture).patches[0].amp.gain;
    expect(after, "a rejected batch must leave the file untouched").toBe(before);
  });

  it("coerces a boolean field", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "amp.solo": "true" } };

    await client.callTool("write_fields", input);

    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].amp.solo).toBe(true);
  });

  it("errors for an unknown device", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "nonexistent", file: temp.fixture, ref: "0", fields: { "amp.gain": "1" } };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
    expect(text).toContain('Unknown device "nonexistent"');
  });

  it("errors for a bad ref", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "No Such Patch", fields: { "amp.gain": "1" } };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
    expect(text).toContain('No patch named "No Such Patch"');
  });

  it("writes a lookup field by label and reads it back as that label", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "delay.highCut": "2.5kHz" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(false);
    const file = gx1.driver.readFile(temp.fixture);
    expect(file.patches[0].delay.highCut).toBe("2.5kHz");
  });

  it("surfaces the codec's error for a label not in the field's table", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "delay.highCut": "2.6kHz" } };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
    expect(text).toContain('Unknown highCut value: "2.6kHz"');
  });
});
