/**
 * Cross-tool behavior against a real device: gx1's own catalog and bytes, not the fake driver every
 * unit suite uses. A regression here can be mcp's wiring or gx1's catalog; either way it belongs
 * outside the per-tool suites.
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { registry } from "@tonesmith/core";
import { connectClient, emptyTempDir } from "../helpers";
import { patchAt } from "./helpers";

describe("a session against a real device", () => {
  let close: () => Promise<void>;
  let cleanup: () => Promise<void> = () => Promise.resolve();
  afterEach(async () => { await close(); await cleanup(); });

  it("describes, generates, reads, edits and copies a patch through one client", async () => {
    const temp = await emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const outPath = join(temp.dir, "session.tsl");
    const dstPath = join(temp.dir, "session-copy.tsl");

    const described = await client.callTool("describe_device", { device: "gx1", items: ["amp/JC-120"] });
    expect(described.isError, described.text).toBe(false);
    const views = JSON.parse(described.text) as Record<string, { example: Record<string, unknown> }>;
    const { example } = views["amp/JC-120"] ?? { example: {} };

    const generated = await client.callTool("generate_patch", {
      device: "gx1", outPath, patches: [{ name: "Session", ...example }],
    });
    expect(generated.isError, generated.text).toBe(false);

    const read = await client.callTool("read_patch", { device: "gx1", file: outPath, ref: "0" });
    expect(read.isError, read.text).toBe(false);
    const { patch } = JSON.parse(read.text) as { patch: { amp: { type: string } } };
    expect(patch.amp.type).toBe("JC-120");

    const written = await client.callTool("write_fields", {
      device: "gx1", file: outPath, ref: "0", fields: { "amp.params.gain": "42" },
    });
    expect(written.isError, written.text).toBe(false);

    const created = await client.callTool("create_patch_file", { device: "gx1", file: dstPath });
    expect(created.isError, created.text).toBe(false);
    const copied = await client.callTool("copy_patch", { device: "gx1", src: outPath, srcRef: "0", dst: dstPath, dstRef: "0" });
    expect(copied.isError, copied.text).toBe(false);

    const final = await patchAt(dstPath);
    expect(final.amp.params.gain).toBe(42);
  });

  // Both tools return core's decoded patch, so this holds them to the same answer. What the patch
  // itself drops is core's to prove.
  it("presents a patch the same way through generate_patch and read_patch", async () => {
    const temp = await emptyTempDir();
    cleanup = temp.cleanup;
    const client = await connectClient();
    close = client.close;
    const outPath = join(temp.dir, "comp.tsl");
    const patchSpec = {
      name: "Comp",
      amp: { type: "JC-120", params: { gain: 50, bass: 50, middle: 50, treble: 50 } },
      fx1: { type: "COMPRESSOR", subType: "ORANGE", params: { sustain: 35, attack: 65, level: 55 } },
    };

    const generated = await client.callTool("generate_patch", { device: "gx1", outPath, patches: [patchSpec] });
    expect(generated.isError, generated.text).toBe(false);
    const { patches } = JSON.parse(generated.text) as { patches: { patch: { fx1: Record<string, unknown> } }[] };
    const echoed = patches[0]?.patch.fx1;

    const read = await client.callTool("read_patch", { device: "gx1", file: outPath, ref: "0" });
    expect(read.isError, read.text).toBe(false);
    const { patch } = JSON.parse(read.text) as { patch: { fx1: Record<string, unknown> } };

    expect(echoed).toStrictEqual(patch.fx1);
  });

  // A device that ships later gets this call for free: the example items list `describe_device`
  // builds from a device's own catalog has to resolve on every registered device, not only gx1.
  it.each(registry.listDrivers().map(driver => driver.id))("resolves its own example items list for %s", async (id) => {
    const client = await connectClient();
    close = client.close;

    const summary = await client.callTool("describe_device", { device: id });
    expect(summary.isError, summary.text).toBe(false);
    const { help } = JSON.parse(summary.text) as { help: string };
    const entries = JSON.parse(help.slice(help.indexOf("["), help.lastIndexOf("]") + 1)) as string[];

    const resolved = await client.callTool("describe_device", { device: id, items: entries });
    expect(resolved.isError, resolved.text).toBe(false);
  });
});
