/**
 * What this tool does with a spec, not what a spec may contain.
 *
 * `@tonesmith/core` is an external library here: it owns which blocks, types and values a device
 * accepts and what a rejection says, and `core/tests` is where those rules are proven. This suite
 * covers the layer above them, which is all `generate-patch.ts` actually holds: the input shape
 * zod enforces, building every spec in order and naming which one failed, round-tripping each
 * patch through the codec before anything is written, and the response a caller reads instead of
 * a follow-up read_patch. A case here should be able to fail while core is entirely correct.
 */
import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { gx1 } from "@tonesmith/core";
import { connectClient, emptyTempDir, patchAt, present } from "./helpers";

interface SavedPatch {
  name: string;
  action: string;
  patch: Record<string, never>;
}

/**
 * Wraps one flat patch spec in the tool's `{ device, outPath, patches: [...] }` shape. Most cases
 * here exercise a single patch; the multi-patch behavior of `patches` has its own cases below.
 */
const single = (spec: Record<string, unknown> & { outPath: string }): Record<string, unknown> => {
  const { outPath, setName, ...patch } = spec;
  const input: Record<string, unknown> = { device: "gx1", outPath, patches: [patch] };
  if (setName !== undefined) input.setName = setName;
  return input;
};

interface GenerateResponse {
  summary: string;
  file: { path: string; setName: string; total: number; created: boolean };
  patches: SavedPatch[];
}

const responseOf = (text: string): GenerateResponse => JSON.parse(text) as GenerateResponse;

/** The per-patch results the tool reports, one entry per patch in the order they were sent. */
const savedPatches = (text: string): SavedPatch[] => responseOf(text).patches;

/** The one entry a single-patch call reports. */
const onlySaved = (text: string): SavedPatch => present(savedPatches(text)[0], "one saved patch");

const AMP = { type: "JC-120", params: { gain: 50, bass: 50, middle: 50, treble: 50 } };

describe("generate_patch", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof emptyTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("builds a spec through the driver and saves it where it was asked to", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "minimal.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Minimal", outPath, amp: AMP };

    const { isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.amp.type).toBe("JC-120");
    expect(patch.amp.params.gain).toBe(50);
  });

  it("echoes the saved decoded patch with its resolved chain in the response", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "echo.tsl");
    const client = await connectClient();
    close = client.close;
    const chain = [...gx1.driver.capabilities.chain.defaultOrder];
    chain.splice(chain.indexOf("drive"), 1);
    chain.splice(chain.indexOf("fx1"), 0, "drive");
    const patchSpec = { name: "Echo", outPath, chain, amp: AMP };

    const { text, isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const saved = onlySaved(text);
    const echoed = saved.patch as unknown as { name: string; chain: string[]; amp: { type: string } };
    expect(echoed.name).toBe("Echo");
    expect(echoed.amp.type).toBe("JC-120");
    expect(echoed.chain).toEqual(chain);
    // The entry says what happened to the patch and carries the patch; nothing of the patch is
    // lifted out beside it, which is what keeps this shape and read_patch's the same.
    expect(Object.keys(saved).sort()).toEqual(["action", "name", "patch"]);
  });

  /**
   * The echo is documented as the confirmation that replaces a follow-up read_patch, so it has to
   * agree with the file. Taking it from the built patch would not: the builder mutates one block in
   * place, so fields belonging to whichever type occupied it before survive in memory. A TERA ECHO
   * reverb, which has no TIME, DENSITY or PRE-DELAY, would keep all three from the blank patch's
   * reverb and report settings the device never stored.
   */
  it("echoes a patch as the file stores it, not as the builder assembled it", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "tera.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Tera",
      outPath,
      amp: AMP,
      reverb: {
        type: "TERA ECHO",
        params: { level: 60, direct: 100, spreadTime: 50, feedback: 40, trigger: false },
      },
    };

    const { text, isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const saved = onlySaved(text);
    const echoed = saved.patch as unknown as { reverb: Record<string, unknown> };
    // Through JSON on both sides: the echo arrives serialized, and that drops the raw-bytes symbol
    // the codec attaches to every decoded block.
    const stored = JSON.parse(JSON.stringify(patchAt(outPath).reverb)) as Record<string, unknown>;
    expect(echoed.reverb).toEqual(stored);
    expect(Object.keys(echoed.reverb)).not.toContain("time");
  });

  // The reason `patches` is an array: a whole set is one call and one file write.
  it("saves every patch in one call, in array order", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "album.tsl");
    const client = await connectClient();
    close = client.close;
    const input = {
      device: "gx1",
      outPath,
      setName: "Album",
      patches: [
        { name: "First", amp: AMP },
        { name: "Second", amp: AMP },
        { name: "Third", amp: AMP },
      ],
    };

    const { text, isError } = await client.callTool("generate_patch", input);

    expect(isError, text).toBe(false);
    const file = gx1.driver.readFile(outPath);
    const patchNames = file.patches.map(patch => patch.name.trim());
    expect(patchNames, "array order is file order").toEqual(["First", "Second", "Third"]);
    expect(file.name).toBe("Album");
    expect(savedPatches(text)).toHaveLength(3);
    // The file half of the response, so a caller knows where the set stands without reading it back.
    expect(responseOf(text).file).toEqual({ path: outPath, setName: "Album", total: 3, created: true });
  });

  it("reports each patch as appended or replaced within one call", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "mixed.tsl");
    const client = await connectClient();
    close = client.close;
    const seed = { device: "gx1", outPath, patches: [{ name: "Lead", amp: AMP }] };
    await client.callTool("generate_patch", seed);

    const input = {
      device: "gx1",
      outPath,
      patches: [
        { name: "Lead", amp: { ...AMP, params: { ...AMP.params, gain: 90 } } },
        { name: "Rhythm", amp: AMP },
      ],
    };
    const { text, isError } = await client.callTool("generate_patch", input);

    expect(isError, text).toBe(false);
    const actions = savedPatches(text).map(saved => `${saved.name.trim()}:${saved.action}`);
    expect(actions).toEqual(["Lead:replaced", "Rhythm:appended"]);
    const file = gx1.driver.readFile(outPath);
    expect(file.patches.map(patch => patch.name.trim())).toEqual(["Lead", "Rhythm"]);
    expect(present(file.patches[0], "patch 0").amp.params.gain).toBe(90);
  });

  it("rejects an empty patches array", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { device: "gx1", outPath: join(temp.dir, "none.tsl"), patches: [] };

    const { isError } = await client.callTool("generate_patch", input);

    expect(isError).toBe(true);
  });

  it("rejects an unknown device, naming the ones it has, without writing anything", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const outPath = join(temp.dir, "unknown.tsl");

    const { isError, text } = await client.callTool("generate_patch", {
      device: "zz9", outPath, patches: [{ name: "A", amp: AMP }],
    });

    expect(isError).toBe(true);
    expect(text).toContain("zz9");
    expect(text).toContain("gx1");
    expect(existsSync(outPath)).toBe(false);
  });

  // Both tools hand their patches through the same view, so this is the one case that holds them
  // to the same answer. What the view itself drops is core's to prove.
  it("presents a patch the same way here and through read_patch", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "comp.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Comp",
      outPath,
      amp: AMP,
      fx1: { type: "COMPRESSOR", subType: "ORANGE", params: { sustain: 35, attack: 65, level: 55 } },
    };

    const gen = await client.callTool("generate_patch", single(patchSpec));
    expect(gen.isError, gen.text).toBe(false);
    const echoed = onlySaved(gen.text).patch as unknown as { fx1: Record<string, unknown> };

    const read = await client.callTool("read_patch", { device: "gx1", file: outPath, ref: "0" });
    expect(read.isError, read.text).toBe(false);
    const body = JSON.parse(read.text) as { patch: { fx1: Record<string, unknown> } };

    expect(echoed.fx1).toEqual(body.patch.fx1);
  });

  // A batch is one call, and the same block is present in every patch of it, so a rejection that
  // names only the block leaves eight candidates. The reason the tool builds each spec itself
  // instead of handing the array to the driver.
  it("names which patch of a batch a builder rejection came from, and writes nothing", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "batch.tsl");
    const client = await connectClient();
    close = client.close;
    const good = { name: "Good", amp: AMP };
    const bad = { name: "Bad One", amp: AMP, fx1: { type: "SCRIPT PH", params: { wobble: 3 } } };

    const { isError, text } = await client.callTool("generate_patch", {
      device: "gx1", outPath, patches: [good, bad],
    });

    expect(isError).toBe(true);
    expect(text, "names the patch, which the driver's own message cannot").toContain("Bad One");
    expect(text, "and carries the driver's reason through").toContain("wobble");
    expect(existsSync(outPath), "one bad patch leaves the whole batch unwritten").toBe(false);
  });
});
