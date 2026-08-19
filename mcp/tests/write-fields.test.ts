/**
 * What this tool does with a batch of edits, not which edits a device accepts.
 *
 * Which dot-paths exist, what each field holds, and how a value is coerced into it are
 * `@tonesmith/core`'s, proven in `core/tests/patch-utils.test.ts` and the gx1 edit validator's
 * suite. What is left here, and all `write-fields.ts` holds, is the tool's own input rule, the
 * two things it can change in one call, and that nothing reaches disk when an edit is refused.
 */
import { describe, it, expect, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";
import { connectClient, withTempDir, patchAt, present } from "./helpers";

describe("write_fields", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof withTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("applies an edit through the driver and writes the file back", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "amp.gain": "88" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(false);
    const file = gx1.driver.readFile(temp.fixture);
    expect(present(file.patches[0], "patch 0").amp.gain).toBe(88);
  });

  it("applies every field in one call", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const fields = { "amp.gain": "77", "ns.threshold": "31", "delay.highCut": "2.5kHz", key: "G" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError, text).toBe(false);
    const patch = patchAt(temp.fixture);
    expect(patch.amp.gain).toBe(77);
    expect(patch.ns.threshold).toBe(31);
    expect(patch.delay.highCut).toBe("2.5kHz");
    expect(patch.key).toBe("G");
  });

  // Every edit lands in memory before the write, so a refusal anywhere in the batch has to leave
  // the file as it was rather than half-applied. Which value gets refused is core's business; that
  // one does is what this needs.
  it("writes nothing when any field in the batch is rejected", async () => {
    temp = withTempDir();
    const client = await connectClient();
    close = client.close;
    const before = patchAt(temp.fixture).amp.gain;
    const fields = { "amp.gain": "99", "delay.highCut": "2.6kHz" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
    const after = patchAt(temp.fixture).amp.gain;
    expect(after).toBe(before);
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
    expect(present(file.patches[0], "patch 0").amp.gain).toBe(55);
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
