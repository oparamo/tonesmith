/**
 * The composition root: that importing it registers every roster driver exactly once, and that
 * its runtime exports are exactly the public surface a consumer of the package sees.
 */
import { describe, it, expect } from "vitest";
import { drivers } from "../src/device";
import * as core from "../src";

describe("src/index", () => {
  it("registers every roster driver on import", () => {
    expect(core.registry.listDrivers().map(driver => driver.id)).toStrictEqual(drivers.map(driver => driver.id));
  });

  it("exports exactly the public runtime surface", () => {
    expect(Object.keys(core).sort()).toStrictEqual(["capabilityService", "gx1", "messageOf", "patchService", "registry"]);
  });
});
