/**
 * What this tool does with a spec, not what a spec may contain.
 *
 * `@tonesmith/core` is an external library here: it owns which blocks, types and values a device
 * accepts and what a rejection says, and `core/tests` is where those rules are proven. This suite
 * covers what `generatePatch.ts` holds: the input shape zod enforces and the response a caller
 * reads instead of a follow-up read_patch.
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { patchService } from "@tonesmith/core";
import { connectClient, emptyTempDir, fakeDriver, present, FAKE_DEVICE_ID } from "../helpers";

interface SavedPatch {
  name: string;
  action: string;
  patch: Record<string, unknown>;
}

interface GenerateResponse {
  summary: string;
  file: { path: string; setName: string; total: number; created: boolean };
  patches: SavedPatch[];
}

const responseOf = (text: string): GenerateResponse => JSON.parse(text) as GenerateResponse;

const CORE_ALPHA = { type: "ALPHA", params: { gain: 50 } };

describe("generate_patch", () => {
  let close: () => Promise<void>;
  let temp: Awaited<ReturnType<typeof emptyTempDir>>;
  afterEach(async () => { await close(); await temp.cleanup(); });

  it("builds a spec through the driver and saves it where it was asked to", async () => {
    temp = await emptyTempDir();
    const outPath = join(temp.dir, "minimal.tsl");
    const client = await connectClient();
    close = client.close;
    const input = { device: FAKE_DEVICE_ID, outPath, patches: [{ name: "Minimal", core: CORE_ALPHA }] };

    const { isError } = await client.callTool("generate_patch", input);

    expect(isError).toBe(false);
    const file = await patchService.readPatchFile(fakeDriver, outPath);
    const saved = present(file.patches[0], "the saved patch") as unknown as { core: { type: string; params: { gain: number } } };
    expect(saved.core.type).toBe("ALPHA");
    expect(saved.core.params.gain).toBe(50);
  });

  it("echoes each saved patch as exactly { name, action, patch }, matching what the file now holds", async () => {
    temp = await emptyTempDir();
    const outPath = join(temp.dir, "echo.tsl");
    const client = await connectClient();
    close = client.close;
    const input = { device: FAKE_DEVICE_ID, outPath, patches: [{ name: "Echo", core: CORE_ALPHA }] };

    const { text, isError } = await client.callTool("generate_patch", input);

    expect(isError, text).toBe(false);
    const [saved] = responseOf(text).patches;
    expect(saved && Object.keys(saved).sort()).toStrictEqual(["action", "name", "patch"]);
    const file = await patchService.readPatchFile(fakeDriver, outPath);
    expect(saved?.patch).toStrictEqual(file.patches[0]);
  });

  it("reports the file's path, set name, total and whether it was created", async () => {
    temp = await emptyTempDir();
    const outPath = join(temp.dir, "album.tsl");
    const client = await connectClient();
    close = client.close;
    const input = {
      device: FAKE_DEVICE_ID,
      outPath,
      setName: "Album",
      patches: [
        { name: "First", core: CORE_ALPHA },
        { name: "Second", core: CORE_ALPHA },
      ],
    };

    const { text, isError } = await client.callTool("generate_patch", input);

    expect(isError, text).toBe(false);
    expect(responseOf(text).file).toStrictEqual({ path: outPath, setName: "Album", total: 2, created: true });
  });

  it("reports `file.created` as false on the second save to an existing file", async () => {
    temp = await emptyTempDir();
    const outPath = join(temp.dir, "existing.tsl");
    const client = await connectClient();
    close = client.close;
    const first = { device: FAKE_DEVICE_ID, outPath, patches: [{ name: "First", core: CORE_ALPHA }] };
    const second = { device: FAKE_DEVICE_ID, outPath, patches: [{ name: "Second", core: CORE_ALPHA }] };
    await client.callTool("generate_patch", first);

    const { text, isError } = await client.callTool("generate_patch", second);

    expect(isError, text).toBe(false);
    expect(responseOf(text).file.created).toBe(false);
  });

  it("declares a `patches` array requiring at least one entry with a `name`", async () => {
    const client = await connectClient();
    close = client.close;
    temp = await emptyTempDir();

    const tool = await client.getToolSchema("generate_patch") as {
      inputSchema: { properties: { patches: { minItems: number; items: { required: string[] } } } };
    };

    expect(tool.inputSchema.properties.patches.minItems).toBe(1);
    expect(tool.inputSchema.properties.patches.items.required).toContain("name");
  });

  it("declares destructive, idempotent and non-open-world annotations and a title", async () => {
    const client = await connectClient();
    close = client.close;
    temp = await emptyTempDir();

    const tool = await client.getToolSchema("generate_patch") as {
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
