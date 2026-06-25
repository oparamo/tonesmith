import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CHAINS,
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
  it("defaults to FX1>AMP>NS>DLY>REV chain", () => {
    const p = basePatch("Lead");
    expect(p.chain).toEqual(CHAINS["FX1>AMP>NS>DLY>REV"]);
  });

  it("accepts each valid chain preset", () => {
    for (const key of Object.keys(CHAINS)) {
      const p = basePatch("Test", key);
      expect(p.chain).toEqual(CHAINS[key]);
    }
  });

  it("throws for an unknown chain key", () => {
    expect(() => basePatch("Bad", "UNKNOWN>CHAIN")).toThrow(/Unknown chain preset/);
  });

  it("sets the patch name", () => {
    expect(basePatch("My Patch").name).toBe("My Patch");
  });
});

describe("amp", () => {
  it("sets all amp fields", () => {
    const p = basePatch("Test");
    amp(p, "JC-120", 60, 55, 50, 45, '4x12"', "CND87", 90);
    expect(p.amp.on).toBe(true);
    expect(p.amp.type).toBe("JC-120");
    expect(p.amp.gain).toBe(60);
    expect(p.amp.bass).toBe(55);
    expect(p.amp.middle).toBe(50);
    expect(p.amp.treble).toBe(45);
    expect(p.amp.speaker).toBe('4x12"');
    expect(p.amp.mic).toBe("CND87");
    expect(p.amp.level).toBe(90);
  });

  it("uses ORIGINAL speaker and DYN57 mic as defaults", () => {
    const p = basePatch("Test");
    amp(p, "TWIN", 50, 50, 50, 50);
    expect(p.amp.speaker).toBe("ORIGINAL");
    expect(p.amp.mic).toBe("DYN57");
    expect(p.amp.level).toBe(100);
  });
});

describe("odds", () => {
  it("sets all odds fields", () => {
    const p = basePatch("Test");
    odds(p, "BLUES OD", 70, 60, 80, 10);
    expect(p.odds.on).toBe(true);
    expect(p.odds.type).toBe("BLUES OD");
    expect(p.odds.drive).toBe(70);
    expect(p.odds.tone).toBe(60);
    expect(p.odds.level).toBe(80);
    expect(p.odds.direct).toBe(10);
  });

  it("defaults direct to 0", () => {
    const p = basePatch("Test");
    odds(p, "OVERDRIVE", 50, 50, 50);
    expect(p.odds.direct).toBe(0);
  });
});

describe("clearOdds", () => {
  it("disables odds", () => {
    const p = basePatch("Test");
    odds(p, "OVERDRIVE", 50, 50, 50);
    expect(p.odds.on).toBe(true);
    clearOdds(p);
    expect(p.odds.on).toBe(false);
  });
});

describe("fx", () => {
  it("sets fx1 block fields", () => {
    const p = basePatch("Test");
    fx(p, "fx1", "CHORUS", null, { rate: 50, depth: 60 });
    expect(p.fx1.on).toBe(true);
    expect(p.fx1.type).toBe("CHORUS");
    expect(p.fx1.subtype).toBeNull();
    expect(p.fx1.params).toEqual({ rate: 50, depth: 60 });
  });

  it("sets fx2 and fx3 independently", () => {
    const p = basePatch("Test");
    fx(p, "fx2", "FLANGER", null, { rate: 30 });
    fx(p, "fx3", "DELAY", "STANDARD", { time: 200 });
    expect(p.fx2.type).toBe("FLANGER");
    expect(p.fx3.type).toBe("DELAY");
    expect(p.fx3.subtype).toBe("STANDARD");
  });

  it("defaults subtype to null and params to {}", () => {
    const p = basePatch("Test");
    fx(p, "fx1", "TREMOLO");
    expect(p.fx1.subtype).toBeNull();
    expect(p.fx1.params).toEqual({});
  });
});

describe("ns", () => {
  it("sets ns fields and enables it by default", () => {
    const p = basePatch("Test");
    ns(p, 40, 30);
    expect(p.ns.on).toBe(true);
    expect(p.ns.threshold).toBe(40);
    expect(p.ns.release).toBe(30);
  });

  it("can set ns to off", () => {
    const p = basePatch("Test");
    ns(p, 40, 30, false);
    expect(p.ns.on).toBe(false);
  });
});

describe("delay", () => {
  it("sets all delay fields", () => {
    const p = basePatch("Test");
    delay(p, "STANDARD", 400, 50, 60, "FLAT");
    expect(p.delay.on).toBe(true);
    expect(p.delay.type).toBe("STANDARD");
    expect(p.delay.time_ms).toBe(400);
    expect(p.delay.feedback).toBe(50);
    expect(p.delay.level).toBe(60);
    expect(p.delay.high_cut).toBe(HIGH_CUT_MAP["FLAT"]);
  });

  it("resolves high cut string to its numeric value", () => {
    const p = basePatch("Test");
    delay(p, "ANALOG", 200, 40, 50, "2.2kHz");
    expect(p.delay.high_cut).toBe(HIGH_CUT_MAP["2.2kHz"]);
  });

  it("falls back to FLAT (29) for an unrecognized high cut string", () => {
    const p = basePatch("Test");
    delay(p, "PAN", 300, 30, 40, "UNKNOWN");
    expect(p.delay.high_cut).toBe(29);
  });

  it("merges extra params", () => {
    const p = basePatch("Test");
    delay(p, "MODULATE", 250, 50, 50, "FLAT", true, { mod_rate: 5 });
    expect((p.delay as Record<string, unknown>).mod_rate).toBe(5);
  });

  it("can disable delay", () => {
    const p = basePatch("Test");
    delay(p, "STANDARD", 400, 50, 60, "FLAT", false);
    expect(p.delay.on).toBe(false);
  });
});

describe("reverb", () => {
  it("sets all reverb fields", () => {
    const p = basePatch("Test");
    reverb(p, "HALL M", 2.5, 80, 10, 5, 7, 90);
    expect(p.reverb.on).toBe(true);
    expect(p.reverb.type).toBe("HALL M");
    expect(p.reverb.time_s).toBe(2.5);
    expect(p.reverb.level).toBe(80);
    expect(p.reverb.pre_delay_ms).toBe(10);
    expect(p.reverb.tone).toBe(5);
    expect(p.reverb.density).toBe(7);
    expect(p.reverb.direct).toBe(90);
  });

  it("uses sensible defaults for optional params", () => {
    const p = basePatch("Test");
    reverb(p, "ROOM S", 1.0, 70);
    expect(p.reverb.pre_delay_ms).toBe(0);
    expect(p.reverb.tone).toBe(0);
    expect(p.reverb.density).toBe(5);
    expect(p.reverb.direct).toBe(100);
  });

  it("merges extra params", () => {
    const p = basePatch("Test");
    reverb(p, "SHIMMER", 3.0, 60, 0, 0, 5, 100, true, { shimmer: 50 });
    expect((p.reverb as Record<string, unknown>).shimmer).toBe(50);
  });

  it("can disable reverb", () => {
    const p = basePatch("Test");
    reverb(p, "PLATE", 1.5, 50, 0, 0, 5, 100, false);
    expect(p.reverb.on).toBe(false);
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

    const p = basePatch("Save Test");
    amp(p, "JC-120", 50, 50, 50, 50);
    saveTsl([p], "Save Test Set", tmpPath);

    const loaded = readFile(tmpPath);
    expect(loaded.patches).toHaveLength(1);
    expect(loaded.patches[0]!.name).toBe("Save Test");
  });

  it("logs the output path via console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const p = basePatch("Log Test");
    saveTsl([p], "Log Set", tmpPath);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(tmpPath));
  });
});
