import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { blankPatch, newFile, readFile, writeFile } from "../../../src/devices/gx1/tsl";
import { RAW } from "../../../src/devices/gx1/common";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/rock-tones.tsl");

describe("blankPatch", () => {
  it("uses 'NEW PATCH' as the default name", () => {
    const p = blankPatch();
    expect(p.name).toBe("NEW PATCH");
  });

  it("accepts a custom name", () => {
    const p = blankPatch("Test Patch");
    expect(p.name).toBe("Test Patch");
  });

  it("returns a decoded patch with all required block fields", () => {
    const p = blankPatch();
    expect(p).toHaveProperty("chain");
    expect(p).toHaveProperty("fx1");
    expect(p).toHaveProperty("fx2");
    expect(p).toHaveProperty("fx3");
    expect(p).toHaveProperty("odds");
    expect(p).toHaveProperty("amp");
    expect(p).toHaveProperty("ns");
    expect(p).toHaveProperty("fv");
    expect(p).toHaveProperty("delay");
    expect(p).toHaveProperty("reverb");
  });

  it("amp is on with TRNSPRNT type by default", () => {
    const p = blankPatch();
    expect(p.amp.on).toBe(true);
    expect(p.amp.type).toBe("TRNSPRNT");
  });

  it("ns is off by default", () => {
    expect(blankPatch().ns.on).toBe(false);
  });

  it("odds is off by default", () => {
    expect(blankPatch().odds.on).toBe(false);
  });
});

describe("newFile", () => {
  it("creates a file with the given set name", () => {
    const f = newFile("My Set");
    expect(f.name).toBe("My Set");
  });

  it("defaults to 1 blank patch", () => {
    const f = newFile("My Set");
    expect(f.patches).toHaveLength(1);
  });

  it("creates n patches when nPatches is specified", () => {
    const f = newFile("Three", 3);
    expect(f.patches).toHaveLength(3);
  });

  it("sets device to GX-1", () => {
    const f = newFile("Set");
    expect(f.device).toBe("GX-1");
    expect(f[RAW].device).toBe("GX-1");
  });
});

describe("readFile", () => {
  it("reads the fixture without throwing", () => {
    expect(() => readFile(FIXTURE)).not.toThrow();
  });

  it("returns a file with patches", () => {
    const file = readFile(FIXTURE);
    expect(file.patches.length).toBeGreaterThan(0);
  });

  it("attaches the raw envelope via RAW symbol", () => {
    const file = readFile(FIXTURE);
    expect(file[RAW]).toBeDefined();
    expect(file[RAW].device).toBe("GX-1");
  });

  it("decoded patches have string names", () => {
    const file = readFile(FIXTURE);
    for (const p of file.patches) {
      expect(typeof p.name).toBe("string");
    }
  });
});

describe("writeFile + readFile round-trip", () => {
  const tmpPath = join(tmpdir(), `tonesmith-tsl-test-${process.pid}.tsl`);

  afterEach(() => {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  });

  it("written file can be read back with identical patch names", () => {
    const original = readFile(FIXTURE);
    writeFile(original, tmpPath);
    const reloaded = readFile(tmpPath);
    expect(reloaded.patches.map(p => p.name)).toEqual(original.patches.map(p => p.name));
  });

  it("written file preserves all paramSet keys byte-for-byte", () => {
    const original = readFile(FIXTURE);
    writeFile(original, tmpPath);

    const origRaw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      data: [Array<{ paramSet: Record<string, string[]> }>, unknown[]];
    };
    const writtenRaw = JSON.parse(readFileSync(tmpPath, "utf8")) as typeof origRaw;

    for (let i = 0; i < origRaw.data[0].length; i++) {
      const origPs  = origRaw.data[0][i]!.paramSet;
      const writPs  = writtenRaw.data[0][i]!.paramSet;
      for (const key of Object.keys(origPs)) {
        expect(writPs[key], `patch ${i} key ${key}`).toEqual(origPs[key]);
      }
    }
  });

  it("writes a blank file and reads it back", () => {
    const f = newFile("Test Set", 2);
    writeFile(f, tmpPath);
    const reloaded = readFile(tmpPath);
    expect(reloaded.patches).toHaveLength(2);
    expect(reloaded.name).toBe("Test Set");
  });
});
