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

    const { isError } = await client.callTool("generate_patch", {
      name: "Minimal",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
    });
    expect(isError).toBe(false);

    const patch = gx1.driver.readFile(outPath).patches[0]!;
    expect(patch.amp.type).toBe("JC-120");
    expect(patch.amp.gain).toBe(50);
  });

  it("round-trips a full patch with every optional block", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "full.tsl");
    const client = await connectClient();
    close = client.close;

    const { isError, text } = await client.callTool("generate_patch", {
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
    });
    expect(isError, text).toBe(false);

    const patch = gx1.driver.readFile(outPath).patches[0]!;
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

    await client.callTool("generate_patch", {
      name: "Chain",
      outPath,
      chain: "FX1>OD>AMP>NS>DLY>REV",
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      odds: { type: "BLUES OD", drive: 40, tone: 60, level: 70 },
    });

    const patch = gx1.driver.readFile(outPath).patches[0]!;
    expect(patch.chain).toContain("OD/DS");
  });

  it("leaves omitted odds/pfx/delay blocks off", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "omitted.tsl");
    const client = await connectClient();
    close = client.close;

    await client.callTool("generate_patch", {
      name: "Omitted",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
    });

    const patch = gx1.driver.readFile(outPath).patches[0]!;
    expect(patch.odds.on).toBe(false);
    expect(patch.pfx.on).toBe(false);
    expect(patch.delay.on).toBe(false);
  });

  it("errors for an invalid amp type", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-amp.tsl");
    const client = await connectClient();
    close = client.close;

    const { isError } = await client.callTool("generate_patch", {
      name: "Bad Amp",
      outPath,
      amp: { type: "NOT-A-REAL-AMP", gain: 50, bass: 50, mid: 50, treble: 50 },
    });
    expect(isError).toBe(true);
  });

  it("errors for an invalid fx type", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-fx.tsl");
    const client = await connectClient();
    close = client.close;

    const { isError } = await client.callTool("generate_patch", {
      name: "Bad FX",
      outPath,
      amp: { type: "JC-120", gain: 50, bass: 50, mid: 50, treble: 50 },
      fx1: { type: "NOT-A-REAL-EFFECT" },
    });
    expect(isError).toBe(true);
  });

  it("errors for an out-of-range zod input", async () => {
    temp = emptyTempDir();
    const outPath = join(temp.dir, "bad-range.tsl");
    const client = await connectClient();
    close = client.close;

    const { isError } = await client.callTool("generate_patch", {
      name: "Bad Range",
      outPath,
      amp: { type: "JC-120", gain: 150, bass: 50, mid: 50, treble: 50 },
    });
    expect(isError).toBe(true);
  });
});
