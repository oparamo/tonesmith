import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { gx1 } from "@tonesmith/core";
import { connectClient, emptyTempDir } from "./helpers";

interface SavedPatch {
  name: string;
  action: string;
  chain: string[];
  patch: Record<string, never>;
}

/**
 * Wraps one flat patch spec in the tool's `{ outPath, patches: [...] }` shape. Most cases here
 * exercise a single patch's build/validation rules; the multi-patch behavior of `patches` has its
 * own dedicated cases below.
 */
const single = (spec: Record<string, unknown> & { outPath: string }): Record<string, unknown> => {
  const { outPath, setName, ...patch } = spec;
  const input: Record<string, unknown> = { outPath, patches: [patch] };
  if (setName !== undefined) input.setName = setName;
  return input;
};

/** The per-patch results array the tool appends after its summary line. */
const savedPatches = (text: string): SavedPatch[] =>
  JSON.parse(text.slice(text.indexOf("["))) as SavedPatch[];

const AMP = { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 };

describe("generate_gx1_patch", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof emptyTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("saves a minimal amp-only patch that decodes cleanly", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "minimal.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Minimal", outPath, amp: AMP };

    const { isError } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.amp.type).toBe("JC-120");
    expect(patch.amp.gain).toBe(50);
  });

  it("echoes the saved decoded patch with its resolved chain in the response", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "echo.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Echo", outPath, chain: ["OD", "FX1", "AMP"], amp: AMP };

    const { text, isError } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const [saved] = savedPatches(text);
    const echoed = saved.patch as unknown as { name: string; chain: string[]; amp: { type: string } };
    expect(echoed.name).toBe("Echo");
    expect(echoed.amp.type).toBe("JC-120");
    // resolved chain echoed back: OD/DS was moved ahead of FX1.
    expect(echoed.chain.indexOf("OD/DS")).toBeLessThan(echoed.chain.indexOf("FX1"));
    // ...and stated per patch, so a caller never has to infer whether its partial-chain reorder
    // was honored from the expanded chain array.
    expect(saved.chain).toEqual(["PFX", "OD/DS", "FX1", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"]);
  });

  // The reason `patches` is an array: a whole set is one call and one file write.
  it("saves every patch in one call, in array order", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "album.tsl");
    const client = await connectClient();
    close = client.close;
    const input = {
      outPath,
      setName: "Album",
      patches: [
        { name: "First", amp: AMP },
        { name: "Second", amp: AMP },
        { name: "Third", amp: AMP },
      ],
    };

    const { text, isError } = await client.callTool("generate_gx1_patch", input);

    expect(isError, text).toBe(false);
    const file = gx1.driver.readFile(outPath);
    const patchNames = file.patches.map(patch => patch.name.trim());
    expect(patchNames, "array order is file order").toEqual(["First", "Second", "Third"]);
    expect(file.name).toBe("Album");
    expect(savedPatches(text)).toHaveLength(3);
  });

  it("reports each patch as appended or replaced within one call", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "mixed.tsl");
    const client = await connectClient();
    close = client.close;
    const seed = { outPath, patches: [{ name: "Lead", amp: AMP }] };
    await client.callTool("generate_gx1_patch", seed);

    const input = {
      outPath,
      patches: [
        { name: "Lead", amp: { ...AMP, gain: 90 } },
        { name: "Rhythm", amp: AMP },
      ],
    };
    const { text, isError } = await client.callTool("generate_gx1_patch", input);

    expect(isError, text).toBe(false);
    const actions = savedPatches(text).map(saved => `${saved.name.trim()}:${saved.action}`);
    expect(actions).toEqual(["Lead:replaced", "Rhythm:appended"]);
    const file = gx1.driver.readFile(outPath);
    expect(file.patches.map(patch => patch.name.trim())).toEqual(["Lead", "Rhythm"]);
    expect(file.patches[0].amp.gain).toBe(90);
  });

  it("rejects an empty patches array", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const input = { outPath: join(temp.dir, "none.tsl"), patches: [] };

    const { isError } = await client.callTool("generate_gx1_patch", input);

    expect(isError).toBe(true);
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
      pfx: { type: "PEDAL BEND", params: { pitchMin: 0, pitchMax: 12, position: 100, level: 100, direct: 0 } },
      fx1: { type: "COMPRESSOR", subType: "D-COMP", params: { sustain: 30, attack: 30, level: 70 } },
      ns: { threshold: 45, release: 30 },
      fv: { position: 100, min: 0, max: 100 },
      delay: { type: "STANDARD", time: 500, feedback: 20, level: 25 },
      reverb: { type: "HALL S", time: 2.4, level: 20 },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
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
      chain: ["FX1", "OD", "AMP", "NS", "DLY", "REV"],
      amp: AMP,
      odds: { type: "BLUES OD", drive: 40, tone: 10, level: 70 },
    };

    await client.callTool("generate_gx1_patch", single(patchSpec));

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.chain).toContain("OD/DS");
  });

  it("leaves omitted odds/pfx/delay blocks off", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "omitted.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Omitted", outPath, amp: AMP };

    await client.callTool("generate_gx1_patch", single(patchSpec));

    const patch = gx1.driver.readFile(outPath).patches[0];
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
      pfx: { type: "WAH", on: false, params: { wahType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 } },
      fx1: { type: "COMPRESSOR", subType: "D-COMP", on: false, params: { sustain: 30, attack: 30, level: 70 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
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

    const { isError } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(true);
  });

  it("errors for an invalid fx type", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-fx.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Bad FX", outPath, amp: AMP, fx1: { type: "NOT-A-REAL-EFFECT" } };

    const { isError } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(true);
  });

  it("builds a pedal WAH whose model is selected by a string params.wahType", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "pedal-wah.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Pedal Wah",
      outPath,
      amp: AMP,
      pfx: { type: "WAH", params: { wahType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.pfx.type).toBe("WAH");
    expect(patch.pfx.wahType).toBe("CRY WAH");
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.fx1.type).toBe("DELAY");
    expect(patch.fx1.subType).toBe("MODULATE");
    expect(patch.fx1.params).toMatchObject({ type: "MODULATE", modRate: 12, modDepth: 18 });
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.fx1.type).toBe("HARMONIST");
    expect(patch.fx1.params.harmony).toBe("+3rd");
  });

  it("builds a TWIST delay whose mode is selected by a string params.mode", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "twist.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Twist Delay",
      outPath,
      amp: AMP,
      delay: {
        type: "TWIST", time: 500, feedback: 20, level: 25,
        params: { mode: "RISE-FADE", riseTime: 10, fallTime: 10, fadeTime: 10 },
      },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.delay.type).toBe("TWIST");
    expect(patch.delay.mode).toBe("RISE-FADE");
  });

  it("builds a SPACE ECHO delay whose head is selected by a string params.head", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "space-echo.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Space Echo",
      outPath,
      amp: AMP,
      delay: { type: "SPACE ECHO", time: 500, feedback: 20, level: 25, params: { head: "1+2" } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.delay.type).toBe("SPACE ECHO");
    expect(patch.delay.head).toBe("1+2");
  });

  it("errors for an out-of-range zod input", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-range.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Bad Range", outPath, amp: { ...AMP, gain: 150 } };

    const { isError } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(true);
  });

  it("creates missing parent directories", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "nested", "sub", "deep.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Deep", outPath, amp: AMP };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    expect(text).toContain("Created");
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.name.trim()).toBe("Deep");
  });

  it("propagates a non-ENOENT read error instead of treating it as a new file", async () => {
    temp = emptyTempDir();
    // outPath points at a directory, not a file: readFileSync throws EISDIR, not ENOENT.
    const outPath = temp.dir;
    const client = await connectClient();
    close = client.close;
    const patchSpec = { name: "Bad Path", outPath, amp: AMP };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(true);
    const lowerCaseText = text.toLowerCase();
    expect(lowerCaseText).toContain("eisdir");
  });

  it("normalizes a partial chain into the full 10-block chain", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "partial-chain.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Partial",
      outPath,
      chain: ["FX1", "OD", "AMP", "FX2", "NS", "DLY", "REV"],
      amp: AMP,
      odds: { type: "BLUES OD", drive: 40, tone: 0, level: 70 },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.chain).toEqual(["PFX", "FX1", "OD/DS", "AMP", "FX2", "FX3", "NS", "FV", "DLY", "REV"]);
  });

  it("upserts by patch name across calls: same name replaces, different name appends", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "upsert.tsl");
    const client = await connectClient();
    close = client.close;

    const first = await client.callTool("generate_gx1_patch", single({ name: "Lead", outPath, amp: AMP }));

    expect(first.isError, first.text).toBe(false);
    expect(first.text).toContain("Created");

    const second = await client.callTool("generate_gx1_patch", single({ name: "Rhythm", outPath, amp: AMP }));

    expect(second.isError, second.text).toBe(false);
    expect(savedPatches(second.text)[0].action).toBe("appended");
    const fileAfterAppend = gx1.driver.readFile(outPath);
    const namesAfterAppend = fileAfterAppend.patches.map(patch => patch.name.trim());
    expect(namesAfterAppend).toEqual(["Lead", "Rhythm"]);

    const replaced = await client.callTool("generate_gx1_patch", single({
      name: "Lead", outPath, amp: { ...AMP, gain: 90 },
    }));

    expect(replaced.isError, replaced.text).toBe(false);
    expect(savedPatches(replaced.text)[0].action).toBe("replaced");
    const file = gx1.driver.readFile(outPath);
    const namesAfterReplace = file.patches.map(patch => patch.name.trim());
    expect(namesAfterReplace).toEqual(["Lead", "Rhythm"]);
    expect(file.patches[0].amp.gain).toBe(90);
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.fx1.params).toEqual({
      "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 5, "8kHz": 0, level: 15,
    });
  });

  it("names the patch set via setName (and defaults to the first patch name without it)", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;

    const named = join(temp.dir, "named.tsl");
    const withName = await client.callTool("generate_gx1_patch", single({ name: "First", outPath: named, setName: "My Library", amp: AMP }));
    expect(withName.isError, withName.text).toBe(false);
    expect(gx1.driver.readFile(named).name).toBe("My Library");

    const unnamed = join(temp.dir, "unnamed.tsl");
    const noName = await client.callTool("generate_gx1_patch", single({ name: "First", outPath: unnamed, amp: AMP }));
    expect(noName.isError, noName.text).toBe(false);
    expect(gx1.driver.readFile(unnamed).name).toBe("First");
  });

  it("hides the redundant params.type mirror from the echo and read_patch, keeping subType canonical", async () => {
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

    const gen = await client.callTool("generate_gx1_patch", single(patchSpec));
    expect(gen.isError, gen.text).toBe(false);
    const echoed = savedPatches(gen.text)[0].patch as unknown as { fx1: { subType: string; params: Record<string, unknown> } };
    expect(echoed.fx1.subType).toBe("ORANGE");
    expect(echoed.fx1.params).not.toHaveProperty("type");
    expect(echoed.fx1.params).toMatchObject({ sustain: 35, attack: 65, level: 55 });

    const read = await client.callTool("read_patch", { device: "gx1", file: outPath, ref: "0" });
    expect(read.isError, read.text).toBe(false);
    const body = JSON.parse(read.text) as { fx1: { subType: string; params: Record<string, unknown> } };
    expect(body.fx1.subType).toBe("ORANGE");
    expect(body.fx1.params).not.toHaveProperty("type");

    // The internal byte storage still carries params.type (driver read bypasses presentPatch).
    expect(gx1.driver.readFile(outPath).patches[0].fx1.params.type).toBe("ORANGE");
  });

  it("rejects a named delay control outside the chosen type's per-type range", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const base = { name: "Dly", outPath: join(temp.dir, "dly.tsl"), amp: AMP };

    // ANALOG's TIME max is 1200ms (narrower than the flat 2000 schema bound).
    const overMax = await client.callTool("generate_gx1_patch", single({ ...base, delay: { type: "ANALOG", time: 1201, feedback: 20, level: 40 } }));
    expect(overMax.isError).toBe(true);
    expect(overMax.text).toContain("delay TIME for ANALOG");

    const atMax = await client.callTool("generate_gx1_patch", single({ ...base, delay: { type: "ANALOG", time: 1200, feedback: 20, level: 40 } }));
    expect(atMax.isError, atMax.text).toBe(false);
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("delay HIGH CUT for ANALOG");
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

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("reverb DENSITY for HALL M");
  });

  it("rejects a pfx param outside the chosen type's range", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Wah",
      outPath: join(temp.dir, "wah-bad.tsl"),
      amp: AMP,
      pfx: { type: "WAH", params: { wahType: "CRY WAH", level: 200, direct: 0, position: 100, min: 0, max: 100 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", single(patchSpec));

    expect(isError).toBe(true);
    expect(text).toContain("pfx LEVEL for WAH");
  });

  // Bare { on: false } and omitting a block both mean "off at factory defaults" — the bytes must
  // agree, so an agent's choice between the two can never change the file.
  it.each(["odds", "fx1", "delay", "reverb", "ns", "pfx"])(
    "writes bare { on: false } on %s byte-identically to omitting it",
    async (block) => {
      temp = emptyTempDir();
      const client = await connectClient();
      close = client.close;
      const omitted = join(temp.dir, `omit-${block}.tsl`);
      const bypassed = join(temp.dir, `bypass-${block}.tsl`);

      const withoutBlock = await client.callTool("generate_gx1_patch", single({ name: "Bypass", outPath: omitted, amp: AMP }));
      const withBareOff = await client.callTool("generate_gx1_patch", single({
        name: "Bypass", outPath: bypassed, amp: AMP, [block]: { on: false },
      }));

      expect(withoutBlock.isError, withoutBlock.text).toBe(false);
      expect(withBareOff.isError, withBareOff.text).toBe(false);
      expect(readFileSync(bypassed)).toEqual(readFileSync(omitted));
    }
  );
});
