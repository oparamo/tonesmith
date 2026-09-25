/**
 * What this tool does with a batch of edits, not which edits a device accepts.
 *
 * Which dot-paths exist, what each field holds, and how a value is coerced into it are
 * `@tonesmith/core`'s, proven in `core/tests/service/patchService.test.ts` and the gx1 edit validator's
 * suite, as is leaving the file untouched when an edit is refused. What is left here, and all
 * `write-fields.ts` holds, is the tool's own input rule and the two things it can change in one
 * call.
 */
import { describe, it, expect, afterEach } from "vitest";
import { gx1, patchService } from "@tonesmith/core";
import { connectClient, withTempDir, patchAt, present } from "./helpers";

describe("write_fields", () => {
  let close: () => Promise<void>;
  let temp: Awaited<ReturnType<typeof withTempDir>>;
  afterEach(async () => { await close(); await temp.cleanup(); });

  it("applies an edit through the driver and writes the file back", async () => {
    temp = await withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "amp.params.gain": "88" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(false);
    const file = await patchService.readPatchFile(gx1.driver, temp.fixture);
    expect(present(file.patches[0], "patch 0").amp.params.gain).toBe(88);
  });

  it("applies every field in one call", async () => {
    temp = await withTempDir();
    const client = await connectClient();
    close = client.close;
    const fields = { "amp.params.gain": "77", "noiseGate.params.threshold": "31", "delay.params.highCut": "2.5kHz", key: "G" };
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError, text).toBe(false);
    const patch = await patchAt(temp.fixture);
    expect(patch.amp.params.gain).toBe(77);
    expect(patch.noiseGate.params.threshold).toBe(31);
    expect(patch.delay.params.highCut).toBe("2.5kHz");
    expect(patch.key).toBe("G");
  });

  it("renames the patch set without needing a ref", async () => {
    temp = await withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, setName: "Renamed Set" };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError, text).toBe(false);
    const file = await patchService.readPatchFile(gx1.driver, temp.fixture);
    expect(file.name).toBe("Renamed Set");
  });

  it("renames the set and edits a patch in one call", async () => {
    temp = await withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, ref: "0", fields: { "amp.params.gain": "55" }, setName: "Both" };

    const { isError, text } = await client.callTool("write_fields", input);

    expect(isError, text).toBe(false);
    const file = await patchService.readPatchFile(gx1.driver, temp.fixture);
    expect(file.name).toBe("Both");
    expect(present(file.patches[0], "patch 0").amp.params.gain).toBe(55);
  });

  it("errors when neither fields nor setName is given", async () => {
    temp = await withTempDir();
    const client = await connectClient();
    close = client.close;

    const { isError } = await client.callTool("write_fields", { device: "gx1", file: temp.fixture });

    expect(isError).toBe(true);
  });

  it("errors when fields is given without a ref", async () => {
    temp = await withTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", file: temp.fixture, fields: { "amp.params.gain": "1" } };

    const { isError } = await client.callTool("write_fields", input);

    expect(isError).toBe(true);
  });
});
