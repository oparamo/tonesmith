import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { blankPatch, newFile, readFile, writeFile } from "../../../src/devices/gx1/tsl";
import { RAW } from "../../../src/devices/gx1/common";

const FIXTURE = resolve(import.meta.dirname, "../../../../fixtures/gx1/rock-tones.tsl");

describe("blankPatch", () => {
  it("uses 'NEW PATCH' as the default name", () => {
    const patch = blankPatch();

    expect(patch.name).toBe("NEW PATCH");
  });

  it("accepts a custom name", () => {
    const patch = blankPatch("Test Patch");

    expect(patch.name).toBe("Test Patch");
  });

  it("returns a decoded patch with all required block fields", () => {
    const patch = blankPatch();

    expect(patch).toHaveProperty("chain");
    expect(patch).toHaveProperty("fx1");
    expect(patch).toHaveProperty("fx2");
    expect(patch).toHaveProperty("fx3");
    expect(patch).toHaveProperty("odds");
    expect(patch).toHaveProperty("amp");
    expect(patch).toHaveProperty("ns");
    expect(patch).toHaveProperty("fv");
    expect(patch).toHaveProperty("delay");
    expect(patch).toHaveProperty("reverb");
  });

  it("amp is on with TRNSPRNT type by default", () => {
    const patch = blankPatch();

    expect(patch.amp.on).toBe(true);
    expect(patch.amp.type).toBe("TRNSPRNT");
  });

  it("ns is off by default", () => {
    const patch = blankPatch();

    expect(patch.ns.on).toBe(false);
  });

  it("odds is off by default", () => {
    const patch = blankPatch();

    expect(patch.odds.on).toBe(false);
  });
});

describe("newFile", () => {
  it("creates a file with the given set name", () => {
    const file = newFile("My Set");

    expect(file.name).toBe("My Set");
  });

  it("defaults to 1 blank patch", () => {
    const file = newFile("My Set");

    expect(file.patches).toHaveLength(1);
  });

  it("creates n patches when nPatches is specified", () => {
    const file = newFile("Three", 3);

    expect(file.patches).toHaveLength(3);
  });

  it("sets device to GX-1", () => {
    const file = newFile("Set");

    expect(file.device).toBe("GX-1");
    expect(file[RAW].device).toBe("GX-1");
  });
});

describe("readFile", () => {
  it("reads the fixture without throwing", () => {
    const readFixture = () => readFile(FIXTURE);

    expect(readFixture).not.toThrow();
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

    for (const patch of file.patches) {
      expect(typeof patch.name).toBe("string");
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

    const reloadedNames = reloaded.patches.map(patch => patch.name);
    const originalNames = original.patches.map(patch => patch.name);
    expect(reloadedNames).toEqual(originalNames);
  });

  it("written file preserves all paramSet keys byte-for-byte", () => {
    const original = readFile(FIXTURE);

    writeFile(original, tmpPath);

    const origFileContents = readFileSync(FIXTURE, "utf8");
    const origRaw = JSON.parse(origFileContents) as {
      data: [{ paramSet: Record<string, string[]> }[], unknown[]];
    };
    const writtenFileContents = readFileSync(tmpPath, "utf8");
    const writtenRaw = JSON.parse(writtenFileContents) as typeof origRaw;

    for (let i = 0; i < origRaw.data[0].length; i++) {
      const origPs  = origRaw.data[0][i].paramSet;
      const writPs  = writtenRaw.data[0][i].paramSet;
      for (const key of Object.keys(origPs)) {
        expect(writPs[key], `patch ${i} key ${key}`).toEqual(origPs[key]);
      }
    }
  });

  it("writes a blank file and reads it back", () => {
    const file = newFile("Test Set", 2);

    writeFile(file, tmpPath);
    const reloaded = readFile(tmpPath);

    expect(reloaded.patches).toHaveLength(2);
    expect(reloaded.name).toBe("Test Set");
  });

  it("creates missing parent directories", () => {
    const nestedDir = join(tmpdir(), `tonesmith-tsl-test-nested-${process.pid}`);
    const nestedPath = join(nestedDir, "sub", "patch.tsl");

    try {
      const file = newFile("Nested Set", 1);

      writeFile(file, nestedPath);

      expect(existsSync(nestedPath)).toBe(true);
    } finally {
      rmSync(nestedDir, { recursive: true, force: true });
    }
  });
});
