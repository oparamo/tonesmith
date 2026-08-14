import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { driver } from "../../../src/devices/gx1/driver";
import { ROCK_TONES_FIXTURE as FIXTURE, present } from "../../helpers";

describe("gx1 driver", () => {
  it("exposes its id, name, and capabilities", () => {
    expect(driver.id).toBe("gx1");
    expect(driver.name).toBe("BOSS GX-1");
    expect(driver.capabilities.groups.length).toBeGreaterThan(0);
  });

  it("blankPatch delegates to the gx1 builder", () => {
    const patch = driver.blankPatch("Test");

    expect(patch.name).toBe("Test");
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
    const file = driver.readFile(FIXTURE);
    const patch = present(file.patches[0], "patch 0 of the fixture");

    const encoded = driver.encodePatch(patch);
    const decoded = driver.decodePatch(encoded);

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

      const loaded = driver.readFile(tmpPath);
      expect(loaded.name).toBe("Driver Set");
    });
  });
});
