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

  it("applies every field in the batch", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const fields = { "amp.gain": "64", "amp.bass": "40" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(false);
    const patch = gx1.driver.readFile(temp.fixture).patches[0];
    expect(patch.amp.gain).toBe(64);
    expect(patch.amp.bass).toBe(40);
  });

  it("writes nothing when any field in the batch is rejected", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const before = gx1.driver.readFile(temp.fixture).patches[0].amp.gain;
    const fields = { "amp.gain": "99", "delay.highCut": "2.6kHz" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
    const after = gx1.driver.readFile(temp.fixture).patches[0].amp.gain;
    expect(after).toBe(before);
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

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
  });

  it("errors for a bad ref", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "No Such Patch", fields: { "amp.gain": "1" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
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

  it("rejects a label not in the field's table", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "delay.highCut": "2.6kHz" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
  });

  it("rejects a field the device doesn't have", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "amp.notAField": "9" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
  });

  it("renames the patch set without needing a ref", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, setName: "Renamed Set" };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError, text).toBe(false);
    expect(gx1.driver.readFile(temp.fixture).name).toBe("Renamed Set");
  });

  it("renames the set and edits a patch in one call", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "amp.gain": "55" }, setName: "Both" };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError, text).toBe(false);
    const file = gx1.driver.readFile(temp.fixture);
    expect(file.name).toBe("Both");
    expect(file.patches[0].amp.gain).toBe(55);
  });

  it("errors when neither fields nor setName is given", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;

    const { isError } = await client.callTool("write_fields", { device: "gx1", file: temp.fixture });

    expect(isError).toBe(true);
  });

  it("errors when fields is given without a ref", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, fields: { "amp.gain": "1" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
  });
});
