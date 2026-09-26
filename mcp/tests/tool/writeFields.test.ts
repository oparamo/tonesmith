/**
 * What this tool does with a batch of edits, not which edits a device accepts.
 *
 * Which dot-paths exist, what each field holds, and how a value is coerced into it are proven in
 * `core/tests/service/patchService.test.ts`, `core/tests/service/specService.test.ts` and
 * `core/tests/device/gx1/spec/edits.test.ts`, as is leaving the file untouched when an edit is
 * refused. What `writeFields.ts` holds is turning the `fields` record into ordered edits and
 * reporting what core wrote.
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { patchService } from "@tonesmith/core";
import { connectClient, emptyTempDir, fakeDriver, FAKE_DEVICE_ID } from "../helpers";

const CORE_ALPHA = { type: "ALPHA", params: { gain: 50 } };

type ConnectedClient = Awaited<ReturnType<typeof connectClient>>;

/** A fresh file holding one patch with two already-set blocks, through generate_patch. */
const seedFile = async (client: ConnectedClient, dir: string): Promise<string> => {
  const file = join(dir, "seed.tsl");
  await client.callTool("generate_patch", {
    device: FAKE_DEVICE_ID,
    outPath: file,
    patches: [{ name: "Seed", core: CORE_ALPHA, solo: { params: { threshold: 5 } } }],
  });
  return file;
};

describe("write_fields", () => {
  let close: () => Promise<void>;
  let temp: Awaited<ReturnType<typeof emptyTempDir>>;
  afterEach(async () => { await close(); await temp.cleanup(); });

  it("applies every field in one call", async () => {
    temp = await emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const file = await seedFile(client, temp.dir);
    const fields = { "core.params.gain": "77", "solo.params.threshold": "31" };

    const { isError, text } = await client.callTool("write_fields", { device: FAKE_DEVICE_ID, file, ref: "0", fields });

    expect(isError, text).toBe(false);
    const written = await patchService.readPatchFile(fakeDriver, file);
    const patch = written.patches[0] as unknown as {
      core: { params: { gain: number } };
      solo: { params: { threshold: number } };
    };
    expect(patch.core.params.gain).toBe(77);
    expect(patch.solo.params.threshold).toBe(31);
  });

  it("reports the patch index and each field's written value", async () => {
    temp = await emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const file = await seedFile(client, temp.dir);
    const fields = { "core.params.gain": "77" };

    const { text } = await client.callTool("write_fields", { device: FAKE_DEVICE_ID, file, ref: "0", fields });

    expect(text).toContain("patch 0:");
    expect(text).toContain("core.params.gain = 77");
  });

  it("renames the patch set without needing a ref", async () => {
    temp = await emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const file = await seedFile(client, temp.dir);

    const { isError } = await client.callTool("write_fields", { device: FAKE_DEVICE_ID, file, setName: "Renamed Set" });

    expect(isError).toBe(false);
    const written = await patchService.readPatchFile(fakeDriver, file);
    expect(written.name).toBe("Renamed Set");
  });

  it("reports the new set name on a rename", async () => {
    temp = await emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const file = await seedFile(client, temp.dir);

    const { text } = await client.callTool("write_fields", { device: FAKE_DEVICE_ID, file, setName: "Renamed Set" });

    expect(text).toContain('set name = "Renamed Set"');
  });

  it("declares destructive, idempotent and non-open-world annotations and a title", async () => {
    temp = await emptyTempDir();
    const client = await connectClient();
    close = client.close;

    const tool = await client.getToolSchema("write_fields") as {
      title?: string;
      annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
    };

    expect(tool.title).toBeTruthy();
    expect(tool.annotations?.readOnlyHint).toBe(false);
    expect(tool.annotations?.destructiveHint).toBe(true);
    expect(tool.annotations?.idempotentHint).toBe(true);
    expect(tool.annotations?.openWorldHint).toBe(false);
  });
});
