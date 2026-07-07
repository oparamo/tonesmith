import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { gx1 } from "@tonesmith/core";
import { connectClient, emptyTempDir } from "./helpers";

describe("generate_patch", () => {
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
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
    };
    const { isError } = await client.callTool("generate_patch", patchSpec);
    expect(isError).toBe(false);

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.amp.type).toBe("JC-120");
    expect(patch.amp.gain).toBe(50);
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
      amp: { type: "JC-120", gain: 60, bass: 55, mid: 45, treble: 50 },
      odds: { type: "BLUES OD", drive: 40, tone: 60, level: 70 },
      pfx: { type: "PEDAL BEND", params: { pitchMin: 0, pitchMax: 12, position: 100, level: 100, direct: 0 } },
      fx1: { type: "COMPRESSOR", subType: "D-COMP", params: { sustain: 30, attack: 30, level: 70 } },
      ns: { threshold: 45, release: 30 },
      fv: { position: 100, min: 0, max: 100 },
      delay: { type: "STANDARD", timeMs: 500, feedback: 20, level: 25 },
      reverb: { type: "HALL S", timeS: 2.4, level: 20 },
    };
    const { isError, text } = await client.callTool("generate_patch", patchSpec);
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
      chain: "FX1>OD>AMP>NS>DLY>REV",
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      odds: { type: "BLUES OD", drive: 40, tone: 60, level: 70 },
    };
    await client.callTool("generate_patch", patchSpec);

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
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
    };
    await client.callTool("generate_patch", patchSpec);

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.odds.on).toBe(false);
    expect(patch.pfx.on).toBe(false);
    expect(patch.delay.on).toBe(false);
  });

  it("errors for an invalid amp type", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-amp.tsl");
    const client = await connectClient();
    close = client.close;

    const patchSpec = {
      name: "Bad Amp",
      outPath,
      amp: { type: "NOT-A-REAL-AMP", gain: 50, bass: 50, mid: 50, treble: 50 },
    };
    const { isError } = await client.callTool("generate_patch", patchSpec);
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
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      fx1: { type: "NOT-A-REAL-EFFECT" },
    };
    const { isError } = await client.callTool("generate_patch", patchSpec);
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
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      pfx: { type: "WAH", params: { wahType: "CRY WAH", level: 100, direct: 0, position: 100, min: 0, max: 100 } },
    };
    const { isError, text } = await client.callTool("generate_patch", patchSpec);
    expect(isError, text).toBe(false);

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.pfx.type).toBe("WAH");
    expect(patch.pfx.wahType).toBe("CRY WAH");
  });

  it("builds an fx-slot FIXED WAH whose model is selected by a string params.wahType", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "fixed-wah.tsl");
    const client = await connectClient();
    close = client.close;

    const patchSpec = {
      name: "Fixed Wah",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      fx1: { type: "FIXED WAH", params: { wahType: "CRY WAH", level: 100, direct: 0, manual: 50 } },
    };
    const { isError, text } = await client.callTool("generate_patch", patchSpec);
    expect(isError, text).toBe(false);

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.fx1.type).toBe("FIXED WAH");
    expect(patch.fx1.params.wahType).toBe("CRY WAH");
  });

  it("builds an fx-slot SLICER whose pattern is selected by a string params.pattern", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "slicer.tsl");
    const client = await connectClient();
    close = client.close;

    const patchSpec = {
      name: "Slicer",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      fx1: { type: "SLICER", params: { pattern: "PATTERN 3", rate: 50, level: 70, attack: 30, duty: 0, direct: 0 } },
    };
    const { isError, text } = await client.callTool("generate_patch", patchSpec);
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
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      fx1: { type: "HARMONIST", params: { harmony: "+3rd", preDelay: 0, level: 70, feedback: 0, direct: 100 } },
    };
    const { isError, text } = await client.callTool("generate_patch", patchSpec);
    expect(isError, text).toBe(false);

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.fx1.type).toBe("HARMONIST");
    expect(patch.fx1.params.harmony).toBe("+3rd");
  });

  it("builds a TWIST delay whose mode is selected by a string extra.mode", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "twist.tsl");
    const client = await connectClient();
    close = client.close;

    const patchSpec = {
      name: "Twist Delay",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      delay: {
        type: "TWIST", timeMs: 500, feedback: 20, level: 25,
        extra: { mode: "TAPE-ECH", riseTime: 10, fallTime: 10, fadeTime: 10 },
      },
    };
    const { isError, text } = await client.callTool("generate_patch", patchSpec);
    expect(isError, text).toBe(false);

    const patch = gx1.driver.readFile(outPath).patches[0];
    expect(patch.delay.type).toBe("TWIST");
    expect(patch.delay.mode).toBe("TAPE-ECH");
  });

  it("builds a SPACE ECHO delay whose head is selected by a string extra.head", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "space-echo.tsl");
    const client = await connectClient();
    close = client.close;

    const patchSpec = {
      name: "Space Echo",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      delay: {
        type: "SPACE ECHO", timeMs: 500, feedback: 20, level: 25,
        extra: { head: "1+2" },
      },
    };
    const { isError, text } = await client.callTool("generate_patch", patchSpec);
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
      amp: { type: "JC-120", gain: 150, bass: 50, mid: 50, treble: 50 },
    };
    const { isError } = await client.callTool("generate_patch", patchSpec);
    expect(isError).toBe(true);
  });
});
