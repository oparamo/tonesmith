import { describe, it, expect } from "vitest";
import type { DeviceCapabilities } from "../src/types";
import { findGroup, findItem } from "../src/capability-utils";

const caps: DeviceCapabilities = {
  groups: [
    {
      id: "amp",
      name: "Amp",
      description: "Amplifier block",
      items: [
        { id: "JC-120", name: "JC-120", description: "Clean amp" },
        { id: "TWIN", name: "Twin", description: "Fender-style amp" },
      ],
    },
    {
      id: "delay",
      name: "Delay",
      description: "Delay block",
      items: [
        { id: "STANDARD", name: "Standard", description: "Standard delay" },
      ],
    },
  ],
};

describe("findGroup", () => {
  it("finds a group by exact id", () => {
    expect(findGroup(caps, "amp").id).toBe("amp");
  });

  it("finds a group case-insensitively", () => {
    expect(findGroup(caps, "AMP").id).toBe("amp");
    expect(findGroup(caps, "Delay").id).toBe("delay");
  });

  it("throws listing available group ids when not found", () => {
    expect(() => findGroup(caps, "reverb")).toThrow('Unknown group "reverb"');
    expect(() => findGroup(caps, "reverb")).toThrow(/amp, delay/);
  });
});

describe("findItem", () => {
  const ampGroup = findGroup(caps, "amp");

  it("finds an item by exact id, case-insensitively", () => {
    expect(findItem(ampGroup, "JC-120").id).toBe("JC-120");
    expect(findItem(ampGroup, "jc-120").id).toBe("JC-120");
  });

  it("finds an item by name prefix when id doesn't match", () => {
    expect(findItem(ampGroup, "Twi").id).toBe("TWIN");
  });

  it("throws listing available item ids when not found", () => {
    expect(() => findItem(ampGroup, "MISSING")).toThrow('Unknown item "MISSING" in group "amp"');
    expect(() => findItem(ampGroup, "MISSING")).toThrow(/JC-120, TWIN/);
  });
});
