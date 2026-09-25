import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { driver } from "../../../src/devices/gx1/driver";
import { ROCK_TONES_FIXTURE as FIXTURE, ROCK_TONES_PATCH_NAMES, present } from "../../helpers";

describe("gx1 driver", () => {
  it("exposes its id, name, and capabilities", () => {
    expect(driver.id).toBe("gx1");
    expect(driver.name).toBe("BOSS GX-1");
    expect(driver.capabilities.groups.map(group => group.id)).toContain("amp");
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

  it("parseFile decodes a real fixture", async () => {
    const file = driver.parseFile(await readFile(FIXTURE), FIXTURE);

    expect(file.patches.map(patch => patch.name)).toEqual(ROCK_TONES_PATCH_NAMES);
  });

  it("encodePatch/decodePatch round-trip a patch through the driver", async () => {
    const file = driver.parseFile(await readFile(FIXTURE), FIXTURE);
    const patch = present(file.patches[0], "patch 0 of the fixture");

    const encoded = driver.encodePatch(patch);
    const decoded = driver.decodePatch(encoded);

    expect(decoded.name).toBe(patch.name);
  });

  describe("serializeFile", () => {
    it("produces bytes parseFile can read back", () => {
      const file = driver.newFile("Driver Set");

      const loaded = driver.parseFile(driver.serializeFile(file), "round-trip");

      expect(loaded.name).toBe("Driver Set");
    });
  });
});
