import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { gx1 } from "@tonesmith/core";
import { connectClient, emptyTempDir, patchAt, present } from "./helpers";

interface SavedPatch {
  name: string;
  action: string;
  chain: string[];
  patch: Record<string, never>;
}

/**
 * Wraps one flat patch spec in the tool's `{ device, outPath, patches: [...] }` shape. Most cases here
 * exercise a single patch's build/validation rules; the multi-patch behavior of `patches` has its
 * own dedicated cases below.
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

const AMP = { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 };

describe("generate_patch", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof emptyTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("saves a minimal amp-only patch that decodes cleanly", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "minimal.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Minimal", outPath, amp: AMP };

    const { isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.amp.type).toBe("JC-120");
    expect(patch.amp.gain).toBe(50);
  });

  it("echoes the saved decoded patch with its resolved chain in the response", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "echo.tsl");
    const client = await connectClient();
    close = client.close;
    const chain = [...gx1.driver.capabilities.chain.defaultOrder];
    chain.splice(chain.indexOf("OD/DS"), 1);
    chain.splice(chain.indexOf("FX1"), 0, "OD/DS");
    const patchSpec = { name: "Echo", outPath, chain, amp: AMP };

    const { text, isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const saved = onlySaved(text);
    const echoed = saved.patch as unknown as { name: string; chain: string[]; amp: { type: string } };
    expect(echoed.name).toBe("Echo");
    expect(echoed.amp.type).toBe("JC-120");
    expect(echoed.chain).toEqual(chain);
    // Stated per patch as well, so the stored order is readable without digging into the patch.
    expect(saved.chain).toEqual(chain);
  });

  /**
   * The echo is documented as the confirmation that replaces a follow-up read_patch, so it has to
   * agree with the file. It did not, and still would not if taken from the built patch: the builder
   * mutates one block in place, so fields belonging to whichever type occupied it before survive in
   * memory. A TERA ECHO reverb, which has no TIME, DENSITY or PRE-DELAY, kept all three from the
   * blank patch's reverb and reported settings the device never stored.
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
        type: "TERA ECHO", level: 60, direct: 100, spreadTime: 50, feedback: 40, trigger: false,
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
        { name: "Lead", amp: { ...AMP, gain: 90 } },
        { name: "Rhythm", amp: AMP },
      ],
    };
    const { text, isError } = await client.callTool("generate_patch", input);

    expect(isError, text).toBe(false);
    const actions = savedPatches(text).map(saved => `${saved.name.trim()}:${saved.action}`);
    expect(actions).toEqual(["Lead:replaced", "Rhythm:appended"]);
    const file = gx1.driver.readFile(outPath);
    expect(file.patches.map(patch => patch.name.trim())).toEqual(["Lead", "Rhythm"]);
    expect(present(file.patches[0], "patch 0").amp.gain).toBe(90);
  });

  // The response is documented as the confirmation, so an echo of two patches where the file keeps
  // one would be a lie a caller has no reason to check.
  it("rejects two patches of the same name in one call, naming both positions", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "dupes.tsl");
    const client = await connectClient();
    close = client.close;
    const input = {
      device: "gx1",
      outPath,
      patches: [{ name: "Lead", amp: AMP }, { name: "Clean", amp: AMP }, { name: "Lead", amp: AMP }],
    };

    const { isError, text } = await client.callTool("generate_patch", input);

    expect(isError).toBe(true);
    expect(text).toContain("Lead");
    expect(text).toMatch(/0/);
    expect(text).toMatch(/2/);
    expect(existsSync(outPath)).toBe(false);
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

  it("round-trips a full patch with every optional block", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "full.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Full Patch",
      outPath,
      key: "G",
      amp: { type: "JC-120", gain: 60, bass: 55, middle: 45, treble: 50 },
      odds: { type: "BLUES OD", drive: 40, tone: 10, level: 70 },
      pfx: { type: "PEDAL BEND", pitchMin: 0, pitchMax: 12, position: 100, level: 100, direct: 0 },
      fx1: { type: "COMPRESSOR", subType: "D-COMP", params: { sustain: 30, attack: 30, level: 70 } },
      ns: { threshold: 45, release: 30 },
      fv: { position: 100, min: 0, max: 100 },
      delay: { type: "STANDARD", time: 500, feedback: 20, level: 25 },
      reverb: { type: "HALL S", time: 2.4, level: 20 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.key).toBe("G");
    expect(patch.odds.on).toBe(true);
    expect(patch.odds.type).toBe("BLUES OD");
    expect(patch.pfx.on).toBe(true);
    expect(patch.fx1.type).toBe("COMPRESSOR");
    expect(patch.fx1.subType).toBe("D-COMP");
    expect(patch.ns.on).toBe(true);
    expect(patch.ns.threshold).toBe(45);
    expect(patch.delay.on).toBe(true);
    expect(patch.delay.type).toBe("STANDARD");
    expect(patch.reverb.on).toBe(true);
    expect(patch.reverb.type).toBe("HALL S");
  });

  it("parses an 'OD' chain token into the 'OD/DS' node", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "chain.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Chain",
      outPath,
      chain: gx1.driver.capabilities.chain.defaultOrder.map(block => (block === "OD/DS" ? "OD" : block)),
      amp: AMP,
      odds: { type: "BLUES OD", drive: 40, tone: 10, level: 70 },
    };

    await client.callTool("generate_patch", single(patchSpec));

    const patch = patchAt(outPath);
    expect(patch.chain).toContain("OD/DS");
  });

  it("leaves omitted odds/pfx/delay blocks off", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "omitted.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Omitted", outPath, amp: AMP };

    await client.callTool("generate_patch", single(patchSpec));

    const patch = patchAt(outPath);
    expect(patch.odds.on).toBe(false);
    expect(patch.pfx.on).toBe(false);
    expect(patch.delay.on).toBe(false);
  });

  it("disables an explicitly-provided pfx or fx slot via on: false", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "explicit-off.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Explicit Off",
      outPath,
      amp: AMP,
      pfx: { type: "WAH", on: false, subType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 },
      fx1: { type: "COMPRESSOR", subType: "D-COMP", on: false, params: { sustain: 30, attack: 30, level: 70 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.pfx.on).toBe(false);
    expect(patch.fx1.on).toBe(false);
  });

  it("bypasses an explicitly-provided amp or odds via on: false, keeping settings", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "amp-odds-off.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Amp Odds Off",
      outPath,
      amp: { ...AMP, gain: 55, on: false },
      odds: { type: "BLUES OD", drive: 40, tone: 10, level: 70, on: false },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.amp.on).toBe(false);
    expect(patch.amp.gain, "amp settings survive a bypass").toBe(55);
    expect(patch.odds.on).toBe(false);
    expect(patch.odds.type, "odds settings survive a bypass").toBe("BLUES OD");
    expect(patch.odds.drive).toBe(40);
  });

  it("builds a pfx block with no params, using its type's defaults", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "pfx-no-params.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Pfx No Params", outPath, amp: AMP, pfx: { type: "WAH" } };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.pfx.on).toBe(true);
    expect(patch.pfx.type).toBe("WAH");
  });

  it("errors for an invalid amp type", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-amp.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Bad Amp",
      outPath,
      amp: { type: "NOT-A-REAL-AMP", gain: 50, bass: 50, middle: 50, treble: 50 },
    };

    const { isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
  });

  it("errors for an invalid fx type", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-fx.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Bad FX", outPath, amp: AMP, fx1: { type: "NOT-A-REAL-EFFECT" } };

    const { isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
  });

  it("builds a pedal WAH whose model is selected by subType", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "pedal-wah.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Pedal Wah",
      outPath,
      amp: AMP,
      pfx: { type: "WAH", subType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.pfx.type).toBe("WAH");
    expect(patch.pfx.subType).toBe("CRY WAH");
  });

  it("builds an fx-slot FIXED WAH whose model is selected by subType", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "fixed-wah.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Fixed Wah",
      outPath,
      amp: AMP,
      fx1: { type: "FIXED WAH", subType: "CRY WAH", params: { level: 100, direct: 0, manual: 50 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.fx1.type).toBe("FIXED WAH");
    expect(patch.fx1.subType).toBe("CRY WAH");
  });

  it("builds an fx-slot DELAY whose sub-algorithm is selected by subType, with its own params", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "fx-delay.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Fx Delay",
      outPath,
      amp: AMP,
      fx1: { type: "DELAY", subType: "MODULATE", params: { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 12, modDepth: 18 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.fx1.type).toBe("DELAY");
    expect(patch.fx1.subType).toBe("MODULATE");
    expect(patch.fx1.params).toMatchObject({ subType: "MODULATE", modRate: 12, modDepth: 18 });
  });

  it("builds an fx-slot REVERB whose algorithm is selected by subType", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "fx-reverb.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Fx Reverb",
      outPath,
      amp: AMP,
      fx1: { type: "REVERB", subType: "HALL M", params: { time: 2.5, level: 40 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.fx1.type).toBe("REVERB");
    expect(patch.fx1.subType).toBe("HALL M");
    expect(patch.fx1.params).toMatchObject({ time: 2.5, level: 40 });
  });

  it("builds an fx-slot SLICER whose pattern is selected by a string params.pattern", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "slicer.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Slicer",
      outPath,
      amp: AMP,
      fx1: { type: "SLICER", params: { pattern: "PATTERN 3", rate: 50, level: 70, attack: 30, duty: 50, direct: 0 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.fx1.type).toBe("SLICER");
    expect(patch.fx1.params.pattern).toBe("PATTERN 3");
  });

  it("builds an fx-slot HARMONIST whose interval is selected by a string params.harmony", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "harmonist.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Harmonist",
      outPath,
      amp: AMP,
      fx1: { type: "HARMONIST", params: { harmony: "+3rd", preDelay: 0, level: 70, feedback: 0, direct: 100 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.fx1.type).toBe("HARMONIST");
    expect(patch.fx1.params.harmony).toBe("+3rd");
  });

  it("builds a TWIST delay whose mode is selected by a string field", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "twist.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Twist Delay",
      outPath,
      amp: AMP,
      // TWIST declares neither TIME nor FEEDBACK, so its variant has no field for either.
      delay: {
        type: "TWIST", level: 25, mode: "RISE-FADE", riseTime: 10, fallTime: 10, fadeTime: 10,
      },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.delay.type).toBe("TWIST");
    expect(patch.delay.mode).toBe("RISE-FADE");
  });

  it("builds a SPACE ECHO delay whose head is selected by a string field", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "space-echo.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Space Echo",
      outPath,
      amp: AMP,
      delay: { type: "SPACE ECHO", time: 500, feedback: 20, level: 25, head: "1+2" },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.delay.type).toBe("SPACE ECHO");
    expect(patch.delay.head).toBe("1+2");
  });

  it("errors for an out-of-range zod input", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-range.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Bad Range", outPath, amp: { ...AMP, gain: 150 } };

    const { isError } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
  });

  it("creates missing parent directories", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "nested", "sub", "deep.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Deep", outPath, amp: AMP };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    expect(responseOf(text).file.created).toBe(true);
    const patch = patchAt(outPath);
    expect(patch.name.trim()).toBe("Deep");
  });

  it("propagates a non-ENOENT read error instead of treating it as a new file", async () => {
    temp = emptyTempDir();
    // outPath points at a directory, not a file: readFileSync throws EISDIR, not ENOENT.
    const outPath = temp.dir;
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Bad Path", outPath, amp: AMP };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    const lowerCaseText = text.toLowerCase();
    expect(lowerCaseText).toContain("eisdir");
  });

  it("rejects a partial chain, naming the blocks left out", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "partial-chain.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Partial", outPath, chain: ["OD/DS", "FX1"], amp: AMP };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    for (const missing of ["PFX", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"]) {
      expect(text, `the rejection must name ${missing} as missing`).toContain(missing);
    }
    expect(existsSync(outPath), "a rejected patch must not leave a file behind").toBe(false);
  });

  it("upserts by patch name across calls: same name replaces, different name appends", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "upsert.tsl");
    const client = await connectClient();
    close = client.close;

    const created = await client.callTool("generate_patch", single({ name: "Lead", outPath, amp: AMP }));

    expect(created.isError, created.text).toBe(false);
    expect(responseOf(created.text).file.created).toBe(true);

    const second = await client.callTool("generate_patch", single({ name: "Rhythm", outPath, amp: AMP }));

    expect(second.isError, second.text).toBe(false);
    expect(onlySaved(second.text).action).toBe("appended");
    const fileAfterAppend = gx1.driver.readFile(outPath);
    const namesAfterAppend = fileAfterAppend.patches.map(patch => patch.name.trim());
    expect(namesAfterAppend).toEqual(["Lead", "Rhythm"]);

    const replaced = await client.callTool("generate_patch", single({
      name: "Lead", outPath, amp: { ...AMP, gain: 90 },
    }));

    expect(replaced.isError, replaced.text).toBe(false);
    expect(onlySaved(replaced.text).action).toBe("replaced");
    const file = gx1.driver.readFile(outPath);
    const namesAfterReplace = file.patches.map(patch => patch.name.trim());
    expect(namesAfterReplace).toEqual(["Lead", "Rhythm"]);
    expect(present(file.patches[0], "patch 0").amp.gain).toBe(90);
  });

  it("defaults unset HIGH GEQ bands to 0 dB instead of the signed-center raw byte", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "geq.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "GEQ",
      outPath,
      amp: AMP,
      fx1: { type: "HIGH GEQ", params: { level: 15, "4kHz": 5 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.fx1.params).toEqual({
      "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 5, "8kHz": 0, level: 15,
    });
  });

  it("names the patch set via setName (and defaults to the first patch name without it)", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;

    const named = join(temp.dir, "named.tsl");
    const withName = await client.callTool("generate_patch", single({ name: "First", outPath: named, setName: "My Library", amp: AMP }));
    expect(withName.isError, withName.text).toBe(false);
    expect(gx1.driver.readFile(named).name).toBe("My Library");

    const unnamed = join(temp.dir, "unnamed.tsl");
    const noName = await client.callTool("generate_patch", single({ name: "First", outPath: unnamed, amp: AMP }));
    expect(noName.isError, noName.text).toBe(false);
    expect(gx1.driver.readFile(unnamed).name).toBe("First");
  });

  it("hides the duplicate inner selection from the echo and read_patch, keeping one subType", async () => {
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
    const echoed = onlySaved(gen.text).patch as unknown as { fx1: { subType: string; params: Record<string, unknown> } };
    expect(echoed.fx1.subType).toBe("ORANGE");
    expect(echoed.fx1.params).not.toHaveProperty("subType");
    expect(echoed.fx1.params).toMatchObject({ sustain: 35, attack: 65, level: 55 });

    const read = await client.callTool("read_patch", { device: "gx1", file: outPath, ref: "0" });
    expect(read.isError, read.text).toBe(false);
    const body = JSON.parse(read.text) as { fx1: { subType: string; params: Record<string, unknown> } };
    expect(body.fx1.subType).toBe("ORANGE");
    expect(body.fx1.params).not.toHaveProperty("subType");

    // The params bag still carries it internally, where the codec reads it from (a driver read
    // bypasses presentPatch).
    expect(patchAt(outPath).fx1.params.subType).toBe("ORANGE");
  });

  it("rejects a named delay control outside the chosen type's per-type range", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const base = { name: "Dly", outPath: join(temp.dir, "dly.tsl"), amp: AMP };

    // ANALOG's TIME max is 1200 ms, against STANDARD's 2000: the bound quoted back proves the
    // chosen type's variant judged it, not some wider bound covering every type.
    const overMax = await client.callTool("generate_patch", single({ ...base, delay: { type: "ANALOG", time: 1201, feedback: 20, level: 40 } }));
    expect(overMax.isError).toBe(true);
    expect(overMax.text).toContain("delay TIME for ANALOG");
    expect(overMax.text).toContain("1200");

    const atMax = await client.callTool("generate_patch", single({ ...base, delay: { type: "ANALOG", time: 1200, feedback: 20, level: 40 } }));
    expect(atMax.isError, atMax.text).toBe(false);
  });

  /**
   * The other half of the per-type range rule. Bounding a flat field by one representative type
   * rejected these before validateTypeParams could judge them against the type actually chosen, so
   * each was a documented value the device accepts and the tool could not express.
   */
  it("accepts values only some types allow, which one representative type's bounds excluded", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const base = { outPath: join(temp.dir, "reachable.tsl"), amp: AMP };

    // SHIMMER's reverb LEVEL starts at 0, the halls' at 1.
    const shimmer = await client.callTool("generate_patch", single({
      ...base, name: "Shim", reverb: { type: "SHIMMER", time: 4, level: 0, pitch: 12, pitchLevel: 50 },
    }));
    expect(shimmer.isError, shimmer.text).toBe(false);

    // SUB DELAY's TIME is 1-2000 ms, against the halls' 0.1-10 s.
    const subDelay = await client.callTool("generate_patch", single({
      ...base, name: "Sub", reverb: { type: "SUB DELAY", time: 400, level: 110, feedback: 30, highCut: "4kHz" },
    }));
    expect(subDelay.isError, subDelay.text).toBe(false);

    // GLITCH's TIME is 0-100. It has no FEEDBACK or LEVEL at all.
    const glitch = await client.callTool("generate_patch", single({
      ...base, name: "Glitch", delay: { type: "GLITCH", time: 0, glitch: 60, balance: 50, trigger: false },
    }));
    expect(glitch.isError, glitch.text).toBe(false);

    const spaceEcho = await client.callTool("generate_patch", single({
      ...base, name: "Space", delay: { type: "SPACE ECHO", time: 400, feedback: 30, level: 0, head: "1+2" },
    }));
    expect(spaceEcho.isError, spaceEcho.text).toBe(false);
  });

  it("rejects an out-of-range params-bag numeric against the effect type's catalog range", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Comp",
      outPath: join(temp.dir, "comp-bad.tsl"),
      amp: AMP,
      fx1: { type: "COMPRESSOR", subType: "ORANGE", params: { sustain: 200, attack: 65, level: 55 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("fx SUSTAIN for COMPRESSOR");
  });

  it("rejects a discrete param value that isn't in the type's value list", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Dly",
      outPath: join(temp.dir, "dly-enum.tsl"),
      amp: AMP,
      delay: { type: "ANALOG", time: 360, feedback: 20, level: 40, highCut: "9kHz" },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("delay HIGH CUT for ANALOG");
    // The rejection enumerates what the field does take, so the caller can pick one.
    expect(text).toContain("6.3kHz");
    expect(text).toContain("FLAT");
  });

  it("rejects a reverb control outside the chosen type's range", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Rev",
      outPath: join(temp.dir, "rev-bad.tsl"),
      amp: AMP,
      reverb: { type: "HALL M", time: 2.0, level: 40, density: 20 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("reverb DENSITY for HALL M");
    // HALL M's DENSITY runs 1-10, so 20 is out even though other reverb params reach 100.
    expect(text).toContain("10");
  });

  it("rejects a pfx param outside the chosen type's range", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Wah",
      outPath: join(temp.dir, "wah-bad.tsl"),
      amp: AMP,
      pfx: { type: "WAH", subType: "CRY WAH", level: 200, direct: 0, position: 100, min: 0, max: 100 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("pfx LEVEL for WAH");
    expect(text).toContain("100");
  });

  // A variant sent through a field the effect doesn't have is the one bad input that used to
  // produce a file: it encoded nowhere, so the patch saved clean and played at the default stage
  // count. The rejection has to name the param that does carry it, or the caller has nowhere to go.
  it("rejects a subType on an effect whose variant is an ordinary param, naming that param", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "phaser-subtype.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Phaser",
      outPath,
      amp: AMP,
      fx1: { type: "PHASER", subType: "4 STAGE", params: { rate: 40, depth: 60 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text, "should point at the param that carries the variant").toContain("params.stage");
    expect(existsSync(outPath), "a rejected patch writes no file").toBe(false);
  });

  it("builds a pedal WAH whose model is selected by subType", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "wah-subtype.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Wah", outPath, amp: AMP, pfx: { type: "WAH", subType: "VO WAH" } };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = patchAt(outPath);
    expect(patch.pfx.subType).toBe("VO WAH");
  });

  it("rejects a subType on a pfx type that has no sub-models", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Bend",
      outPath: join(temp.dir, "bend-subtype.tsl"),
      amp: AMP,
      pfx: { type: "PEDAL BEND", subType: "CRY WAH" },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("PEDAL BEND");
  });

  // Every block's fields are the ones its type actually has, so an invented one is a param in the
  // wrong place (`rate` belongs in `params`) or a guess. Either way the byte it meant to set stays
  // at its default, which is the same silent miss a stray subType used to produce.
  it("rejects a field a block does not have, rather than ignoring it", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Stray",
      outPath: join(temp.dir, "stray-field.tsl"),
      amp: AMP,
      fx1: { type: "CHORUS", rate: 50 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("rate");
  });

  it("rejects a field a patch spec does not have, rather than ignoring it", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Stray", outPath: join(temp.dir, "stray-spec.tsl"), amp: AMP, tempo: 120 };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("tempo");
  });

  // The decoded patch carries a per-type param flat on the block, which is the shape read_patch
  // returns and generate echoes back, so a caller mirroring what it just read sends it flat too.
  // That used to be rejected. Now it is the accepted shape, and this is the round trip proving it.
  it("takes a type-specific param as a field on the block and encodes it", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "shimmer.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Shimmer",
      outPath,
      amp: AMP,
      reverb: { type: "SHIMMER", time: 4, tone: -3, preDelay: 25, level: 55, pitch: 12, pitchLevel: 45 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const { reverb } = patchAt(outPath);
    expect(reverb.pitch).toBe(12);
    expect(reverb.pitchLevel).toBe(45);
  });

  it("rejects a field belonging to a different type of the same block, naming the chosen type's own", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    // `pitch` is SHIMMER's, not HALL M's.
    const patchSpec = {
      name: "Hall",
      outPath: join(temp.dir, "wrong-type-field.tsl"),
      amp: AMP,
      reverb: { type: "HALL M", time: 2.4, level: 40, pitch: 12 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("pitch");
    expect(text, "should print the shape HALL M does take").toContain("density");
    expect(text).toContain("HALL M");
  });

  it("rejects an unknown type, naming the ones the block has", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Nope",
      outPath: join(temp.dir, "unknown-type.tsl"),
      amp: AMP,
      delay: { type: "WOBBLE", time: 400 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    for (const typeId of ["STANDARD", "SPACE ECHO", "GLITCH"]) expect(text).toContain(typeId);
  });

  // An unknown subType on a type that has them used to reach the codec's lookup and come back as
  // `Unknown type value: "wobble"`, naming neither the block, nor the field, nor the valid values.
  it("rejects an unknown subType on a type that has subTypes, naming the valid ones", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Comp",
      outPath: join(temp.dir, "unknown-subtype.tsl"),
      amp: AMP,
      fx1: { type: "COMPRESSOR", subType: "WOBBLE", params: { sustain: 30 } },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("WOBBLE");
    expect(text).toContain("COMPRESSOR");
    expect(text, "should list the variants the type does have").toContain("ORANGE");
  });

  // Flattening the other blocks makes the fx slots the odd ones out, so the likely mistake inverts:
  // a caller sends an fx param as a field by analogy with delay or reverb.
  it("names params as the destination for an fx param sent at the block level", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Phase",
      outPath: join(temp.dir, "fx-flat.tsl"),
      amp: AMP,
      fx1: { type: "SCRIPT PH", rate: 40, depth: 60 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("rate");
    expect(text).toContain("depth");
    expect(text, "should print the type it was sent, not a generic outline").toContain("SCRIPT PH");
    expect(text, "should name where those params belong").toContain("params");
  });

  it("names a single-shape block's own fields for a key it doesn't have, with no params to offer", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Amp",
      outPath: join(temp.dir, "amp-stray.tsl"),
      amp: { ...AMP, presence: 40 },
    };

    const { isError, text } = await client.callTool("generate_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("presence");
    expect(text).toContain("treble");
    expect(text, "amp has no params record to redirect anything into").not.toContain("params: {");
  });

  // A batch is one call, and the same block is present in every patch of it, so a rejection that
  // names only the block leaves eight candidates.
  it("names which patch of a batch a builder rejection came from", async () => {
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
    expect(text).toContain("Bad One");
    expect(text).toContain("wobble");
    expect(existsSync(outPath), "one bad patch leaves the whole batch unwritten").toBe(false);
  });

  // Bare { on: false } and omitting a block both mean "off at factory defaults", so the bytes must
  // agree, so an agent's choice between the two can never change the file.
  it.each(["odds", "fx1", "delay", "reverb", "ns", "pfx"])(
    "writes bare { on: false } on %s byte-identically to omitting it",
    async (block) => {
      temp = emptyTempDir();
      const client = await connectClient();
      close = client.close;
      const omitted = join(temp.dir, `omit-${block}.tsl`);
      const bypassed = join(temp.dir, `bypass-${block}.tsl`);

      const withoutBlock = await client.callTool("generate_patch", single({ name: "Bypass", outPath: omitted, amp: AMP }));
      const withBareOff = await client.callTool("generate_patch", single({
        name: "Bypass", outPath: bypassed, amp: AMP, [block]: { on: false },
      }));

      expect(withoutBlock.isError, withoutBlock.text).toBe(false);
      expect(withBareOff.isError, withBareOff.text).toBe(false);
      expect(readFileSync(bypassed)).toEqual(readFileSync(omitted));
    }
  );
});
