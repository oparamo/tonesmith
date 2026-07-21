import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { gx1 } from "@tonesmith/core";
import { connectClient, emptyTempDir } from "./helpers";

describe("generate_gx1_patch", () => {
  let close: () => Promise<void>;
  let temp: ReturnType<typeof emptyTempDir>;
  afterEach(async () => { await close(); temp.cleanup(); });

  it("saves a minimal amp-only patch that decodes cleanly", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "minimal.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Minimal",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
    };

    const { isError } = await client.callTool("generate_gx1_patch", patchSpec);

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
    const patchSpec = {
      name: "Echo",
      outPath,
      chain: ["OD", "FX1", "AMP"],
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
    };

    const { text, isError } = await client.callTool("generate_gx1_patch", patchSpec);

    expect(isError, text).toBe(false);
    const echoed = JSON.parse(text.slice(text.indexOf("{"))) as { name: string; chain: string[]; amp: { type: string } };
    expect(echoed.name).toBe("Echo");
    expect(echoed.amp.type).toBe("JC-120");
    // resolved chain echoed back: OD/DS was moved ahead of FX1.
    expect(echoed.chain.indexOf("OD/DS")).toBeLessThan(echoed.chain.indexOf("FX1"));
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
      delay: { type: "STANDARD", timeMs: 500, feedback: 20, level: 25 },
      reverb: { type: "HALL S", timeS: 2.4, level: 20 },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      odds: { type: "BLUES OD", drive: 40, tone: 10, level: 70 },
    };

    await client.callTool("generate_gx1_patch", patchSpec);

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.chain).toContain("OD/DS");
  });

  it("leaves omitted odds/pfx/delay blocks off", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "omitted.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Omitted",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
    };

    await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      pfx: { type: "WAH", on: false, params: { wahType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 } },
      fx1: { type: "COMPRESSOR", subType: "D-COMP", on: false, params: { sustain: 30, attack: 30, level: 70 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.pfx.on).toBe(false);
    expect(patch.fx1.on).toBe(false);
  });

  it("builds a pfx block with no params, using its type's defaults", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "pfx-no-params.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Pfx No Params",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      pfx: { type: "WAH" },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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

    const { isError } = await client.callTool("generate_gx1_patch", patchSpec);

    expect(isError).toBe(true);
  });

  it("errors for an invalid fx type", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-fx.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Bad FX",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "NOT-A-REAL-EFFECT" },
    };

    const { isError } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      pfx: { type: "WAH", params: { wahType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "FIXED WAH", subType: "CRY WAH", params: { level: 100, direct: 0, manual: 50 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "DELAY", subType: "MODULATE", params: { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 12, modDepth: 18 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.fx1.type).toBe("DELAY");
    expect(patch.fx1.subType).toBe("MODULATE");
    expect(patch.fx1.params).toMatchObject({ type: "MODULATE", modRate: 12, modDepth: 18 });
  });

  it("builds an fx-slot SLICER whose pattern is selected by a string params.pattern", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "slicer.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Slicer",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "SLICER", params: { pattern: "PATTERN 3", rate: 50, level: 70, attack: 30, duty: 50, direct: 0 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "HARMONIST", params: { harmony: "+3rd", preDelay: 0, level: 70, feedback: 0, direct: 100 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      delay: {
        type: "TWIST", timeMs: 500, feedback: 20, level: 25,
        params: { mode: "RISE-FADE", riseTime: 10, fallTime: 10, fadeTime: 10 },
      },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      delay: {
        type: "SPACE ECHO", timeMs: 500, feedback: 20, level: 25,
        params: { head: "1+2" },
      },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
    const patchSpec = {
      name: "Bad Range",
      outPath,
      amp: { type: "JC-120", gain: 150, bass: 50, middle: 50, treble: 50 },
    };

    const { isError } = await client.callTool("generate_gx1_patch", patchSpec);

    expect(isError).toBe(true);
  });

  it("creates missing parent directories", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "nested", "sub", "deep.tsl");
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Deep",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
    const patchSpec = {
      name: "Bad Path",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      odds: { type: "BLUES OD", drive: 40, tone: 0, level: 70 },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

    expect(isError, text).toBe(false);
    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.chain).toEqual(["PFX", "FX1", "OD/DS", "AMP", "FX2", "FX3", "NS", "FV", "DLY", "REV"]);
  });

  it("upserts by patch name: same name replaces, different name appends", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "upsert.tsl");
    const client = await connectClient();
    close = client.close;
    const ampSpec = { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 };

    const first = await client.callTool("generate_gx1_patch", { name: "Lead", outPath, amp: ampSpec });

    expect(first.isError, first.text).toBe(false);
    expect(first.text).toContain("Created");

    const second = await client.callTool("generate_gx1_patch", { name: "Rhythm", outPath, amp: ampSpec });

    expect(second.isError, second.text).toBe(false);
    expect(second.text).toContain("Appended");
    const fileAfterAppend = gx1.driver.readFile(outPath);
    const namesAfterAppend = fileAfterAppend.patches.map(patch => patch.name.trim());
    expect(namesAfterAppend).toEqual(["Lead", "Rhythm"]);

    const replaced = await client.callTool("generate_gx1_patch", {
      name: "Lead", outPath, amp: { ...ampSpec, gain: 90 },
    });

    expect(replaced.isError, replaced.text).toBe(false);
    expect(replaced.text).toContain("Replaced");
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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "HIGH GEQ", params: { level: 15, "4kHz": 5 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
    const ampSpec = { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 };

    const named = join(temp.dir, "named.tsl");
    const withName = await client.callTool("generate_gx1_patch", { name: "First", outPath: named, setName: "My Library", amp: ampSpec });
    expect(withName.isError, withName.text).toBe(false);
    expect(gx1.driver.readFile(named).name).toBe("My Library");

    const unnamed = join(temp.dir, "unnamed.tsl");
    const noName = await client.callTool("generate_gx1_patch", { name: "First", outPath: unnamed, amp: ampSpec });
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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "COMPRESSOR", subType: "ORANGE", params: { sustain: 35, attack: 65, level: 55 } },
    };

    const gen = await client.callTool("generate_gx1_patch", patchSpec);
    expect(gen.isError, gen.text).toBe(false);
    const echoed = JSON.parse(gen.text.slice(gen.text.indexOf("{"))) as { fx1: { subType: string; params: Record<string, unknown> } };
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
    const ampSpec = { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 };
    const base = { name: "Dly", outPath: join(temp.dir, "dly.tsl"), amp: ampSpec };

    // ANALOG's TIME max is 1200ms (narrower than the flat 2000 schema bound).
    const overMax = await client.callTool("generate_gx1_patch", { ...base, delay: { type: "ANALOG", timeMs: 1201, feedback: 20, level: 40 } });
    expect(overMax.isError).toBe(true);
    expect(overMax.text).toContain("delay TIME for ANALOG");

    const atMax = await client.callTool("generate_gx1_patch", { ...base, delay: { type: "ANALOG", timeMs: 1200, feedback: 20, level: 40 } });
    expect(atMax.isError, atMax.text).toBe(false);
  });

  it("rejects an out-of-range params-bag numeric against the effect type's catalog range", async () => {
    temp = emptyTempDir();
    const client = await connectClient();
    close = client.close;
    const patchSpec = {
      name: "Comp",
      outPath: join(temp.dir, "comp-bad.tsl"),
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      fx1: { type: "COMPRESSOR", subType: "ORANGE", params: { sustain: 200, attack: 65, level: 55 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      delay: { type: "ANALOG", timeMs: 360, feedback: 20, level: 40, highCut: "9kHz" },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      reverb: { type: "HALL M", timeS: 2.0, level: 40, density: 20 },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, middle: 50, treble: 50 },
      pfx: { type: "WAH", params: { wahType: "CRY WAH", level: 200, direct: 0, position: 100, min: 0, max: 100 } },
    };

    const { isError, text } = await client.callTool("generate_gx1_patch", patchSpec);

    expect(isError).toBe(true);
    expect(text).toContain("pfx LEVEL for WAH");
  });
});
