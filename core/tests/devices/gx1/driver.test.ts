import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { driver } from "../../../src/devices/gx1/driver";

const FIXTURE = resolve(import.meta.dirname, "../../../../fixtures/gx1/rock-tones.tsl");

describe("gx1 driver", () => {
  it("exposes its id, name, and capabilities", () => {
    expect(driver.id).toBe("gx1");
    expect(driver.name).toBe("BOSS GX-1");
    expect(driver.capabilities.groups.length).toBeGreaterThan(0);
  });

  it("blankPatch delegates to the gx1 builder", () => {
    expect(driver.blankPatch("Test").name).toBe("Test");
  });

  it("newFile delegates to the gx1 file builder", () => {
    const file = driver.newFile("My Set", 2);
    expect(file.name).toBe("My Set");
    expect(file.patches).toHaveLength(2);
  });

  it("readFile decodes a real fixture", () => {
    const file = driver.readFile(FIXTURE);
    expect(file.patches.length).toBeGreaterThan(0);
  });

  it("encodePatch/decodePatch round-trip a patch through the driver", () => {
    const patch = driver.readFile(FIXTURE).patches[0];
    const decoded = driver.decodePatch(driver.encodePatch(patch));
    expect(decoded.name).toBe(patch.name);
  });

  describe("writeFile", () => {
    const tmpPath = join(tmpdir(), `tonesmith-driver-test-${process.pid}.tsl`);

    afterEach(() => {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    });

    it("writes a file that can be read back", () => {
      const file = driver.newFile("Driver Set");
      driver.writeFile(file, tmpPath);
      expect(driver.readFile(tmpPath).name).toBe("Driver Set");
    });
  });
});
