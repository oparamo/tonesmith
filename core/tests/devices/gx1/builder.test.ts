import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_CHAIN,
  moveBefore,
  basePatch,
  amp,
  odds,
  clearOdds,
  fx,
  ns,
  delay,
  reverb,
  saveTsl,
  HIGH_CUT_MAP,
} from "../../../src/devices/gx1/builder";

describe("basePatch", () => {
  it("defaults to DEFAULT_CHAIN", () => {
    const patch = basePatch("Lead");
    expect(patch.chain).toEqual(DEFAULT_CHAIN);
  });

  it("accepts a custom chain array", () => {
    const custom = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");
    const patch = basePatch("Test", custom);
    expect(patch.chain).toEqual(custom);
  });

  it("sets the patch name", () => {
    expect(basePatch("My Patch").name).toBe("My Patch");
  });
});

describe("moveBefore", () => {
  it("relocates a node to sit immediately before another, preserving the rest", () => {
    const result = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");
    expect(result.indexOf("OD/DS")).toBe(result.indexOf("FX1") - 1);
    expect(result).toHaveLength(DEFAULT_CHAIN.length);
    expect(new Set(result)).toEqual(new Set(DEFAULT_CHAIN));
  });

  it("throws when beforeNode isn't found in the chain", () => {
    expect(() => moveBefore(DEFAULT_CHAIN, "FX2", "NOT-A-NODE")).toThrow(/not found in chain/);
  });
});

describe("amp", () => {
  it("sets all amp fields", () => {
    const patch = basePatch("Test");
    amp(patch, "JC-120", 60, 55, 50, 45, '4x12"', "CND87", 90);
    expect(patch.amp.on).toBe(true);
    expect(patch.amp.type).toBe("JC-120");
    expect(patch.amp.gain).toBe(60);
    expect(patch.amp.bass).toBe(55);
    expect(patch.amp.middle).toBe(50);
    expect(patch.amp.treble).toBe(45);
    expect(patch.amp.speaker).toBe('4x12"');
    expect(patch.amp.mic).toBe("CND87");
    expect(patch.amp.level).toBe(90);
  });

  it("uses ORIGINAL speaker and DYN57 mic as defaults", () => {
    const patch = basePatch("Test");
    amp(patch, "TWIN", 50, 50, 50, 50);
    expect(patch.amp.speaker).toBe("ORIGINAL");
    expect(patch.amp.mic).toBe("DYN57");
    expect(patch.amp.level).toBe(100);
  });
});

describe("odds", () => {
  it("sets all odds fields", () => {
    const patch = basePatch("Test");
    odds(patch, "BLUES OD", 70, 60, 80, 10);
    expect(patch.odds.on).toBe(true);
    expect(patch.odds.type).toBe("BLUES OD");
    expect(patch.odds.drive).toBe(70);
    expect(patch.odds.tone).toBe(60);
    expect(patch.odds.level).toBe(80);
    expect(patch.odds.direct).toBe(10);
  });

  it("defaults direct to 0", () => {
    const patch = basePatch("Test");
    odds(patch, "OVERDRIVE", 50, 50, 50);
    expect(patch.odds.direct).toBe(0);
  });
});

describe("clearOdds", () => {
  it("disables odds", () => {
    const patch = basePatch("Test");
    odds(patch, "OVERDRIVE", 50, 50, 50);
    expect(patch.odds.on).toBe(true);
    clearOdds(patch);
    expect(patch.odds.on).toBe(false);
  });
});

describe("fx", () => {
  it("sets fx1 block fields", () => {
    const patch = basePatch("Test");
    fx(patch, "fx1", "CHORUS", null, { rate: 50, depth: 60 });
    expect(patch.fx1.on).toBe(true);
    expect(patch.fx1.type).toBe("CHORUS");
    expect(patch.fx1.subType).toBeNull();
    expect(patch.fx1.params).toEqual({ rate: 50, depth: 60 });
  });

  it("sets fx2 and fx3 independently", () => {
    const patch = basePatch("Test");
    fx(patch, "fx2", "FLANGER", null, { rate: 30 });
    fx(patch, "fx3", "DELAY", "STANDARD", { time: 200 });
    expect(patch.fx2.type).toBe("FLANGER");
    expect(patch.fx3.type).toBe("DELAY");
    expect(patch.fx3.subType).toBe("STANDARD");
  });

  it("defaults subType to null and params to {}", () => {
    const patch = basePatch("Test");
    fx(patch, "fx1", "TREMOLO");
    expect(patch.fx1.subType).toBeNull();
    expect(patch.fx1.params).toEqual({});
  });
});

describe("ns", () => {
  it("sets ns fields and enables it by default", () => {
    const patch = basePatch("Test");
    ns(patch, 40, 30);
    expect(patch.ns.on).toBe(true);
    expect(patch.ns.threshold).toBe(40);
    expect(patch.ns.release).toBe(30);
  });

  it("can set ns to off", () => {
    const patch = basePatch("Test");
    ns(patch, 40, 30, false);
    expect(patch.ns.on).toBe(false);
  });
});

describe("delay", () => {
  it("sets all delay fields", () => {
    const patch = basePatch("Test");
    delay(patch, "STANDARD", 7, 50, 60, "FLAT");
    expect(patch.delay.on).toBe(true);
    expect(patch.delay.type).toBe("STANDARD");
    expect(patch.delay.time).toBe(7);
    expect(patch.delay.feedback).toBe(50);
    expect(patch.delay.level).toBe(60);
    expect(patch.delay.highCut).toBe(HIGH_CUT_MAP["FLAT"]);
  });

  it("resolves high cut string to its numeric value", () => {
    const patch = basePatch("Test");
    delay(patch, "ANALOG", 1, 40, 50, "2kHz");
    expect(patch.delay.highCut).toBe(HIGH_CUT_MAP["2kHz"]);
  });

  it("falls back to FLAT (29) for an unrecognized high cut string", () => {
    const patch = basePatch("Test");
    delay(patch, "PAN", 1, 30, 40, "UNKNOWN");
    expect(patch.delay.highCut).toBe(29);
  });

  it("merges extra params", () => {
    const patch = basePatch("Test");
    delay(patch, "MODULATE", 1, 50, 50, "FLAT", true, { modRate: 5 });
    expect((patch.delay as Record<string, unknown>).modRate).toBe(5);
  });

  it("can disable delay", () => {
    const patch = basePatch("Test");
    delay(patch, "STANDARD", 7, 50, 60, "FLAT", false);
    expect(patch.delay.on).toBe(false);
  });
});

describe("reverb", () => {
  it("sets all reverb fields", () => {
    const patch = basePatch("Test");
    reverb(patch, "HALL M", 2.5, 80, 10, 5, 7, 90);
    expect(patch.reverb.on).toBe(true);
    expect(patch.reverb.type).toBe("HALL M");
    expect(patch.reverb.time).toBe(2.5);
    expect(patch.reverb.level).toBe(80);
    expect(patch.reverb.preDelay).toBe(10);
    expect(patch.reverb.tone).toBe(5);
    expect(patch.reverb.density).toBe(7);
    expect(patch.reverb.direct).toBe(90);
  });

  it("uses sensible defaults for optional params", () => {
    const patch = basePatch("Test");
    reverb(patch, "ROOM S", 1.0, 70);
    expect(patch.reverb.preDelay).toBe(0);
    expect(patch.reverb.tone).toBe(0);
    expect(patch.reverb.density).toBe(5);
    expect(patch.reverb.direct).toBe(100);
  });

  it("merges extra params", () => {
    const patch = basePatch("Test");
    reverb(patch, "SHIMMER", 3.0, 60, 0, 0, 5, 100, true, { shimmer: 50 });
    expect((patch.reverb as Record<string, unknown>).shimmer).toBe(50);
  });

  it("can disable reverb", () => {
    const patch = basePatch("Test");
    reverb(patch, "PLATE", 1.5, 50, 0, 0, 5, 100, false);
    expect(patch.reverb.on).toBe(false);
  });
});

describe("saveTsl", () => {
  const tmpPath = join(tmpdir(), `tonesmith-builder-test-${process.pid}.tsl`);

  afterEach(() => {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
    vi.restoreAllMocks();
  });

  it("writes a file that can be read back", async () => {
    const { readFile } = await import("../../../src/devices/gx1/tsl");
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const patch = basePatch("Save Test");
    amp(patch, "JC-120", 50, 50, 50, 50);
    saveTsl([patch], "Save Test Set", tmpPath);

    const loaded = readFile(tmpPath);
    expect(loaded.patches).toHaveLength(1);
    expect(loaded.patches[0]!.name).toBe("Save Test");
  });

  it("logs the output path via console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const patch = basePatch("Log Test");
    saveTsl([patch], "Log Set", tmpPath);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(tmpPath));
  });
});
