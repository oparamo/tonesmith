import { describe, it, expect } from "vitest";
import { registry } from "@tonesmith/core";
import { instructions } from "../src/instructions";

describe("instructions", () => {
  // Derived from whatever is registered rather than a hardcoded gx1 list, so a device added later
  // is covered without an edit here.
  it("stays device-agnostic, with no device-specific tokens leaking in", () => {
    const tokens = registry.listDrivers().flatMap(driver => [driver.id, driver.name]);

    expect(tokens.filter(token => instructions.includes(token))).toStrictEqual([]);
  });
});
