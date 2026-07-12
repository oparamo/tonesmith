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
    const group = findGroup(caps, "amp");

    expect(group.id).toBe("amp");
  });

  it("finds a group case-insensitively", () => {
    const upperCaseMatch = findGroup(caps, "AMP");
    const mixedCaseMatch = findGroup(caps, "Delay");

    expect(upperCaseMatch.id).toBe("amp");
    expect(mixedCaseMatch.id).toBe("delay");
  });

  it("throws listing available group ids when not found", () => {
    const findMissingGroup = () => findGroup(caps, "reverb");

    expect(findMissingGroup).toThrow('Unknown group "reverb"');
    expect(findMissingGroup).toThrow(/amp, delay/);
  });
});

describe("findItem", () => {
  const ampGroup = findGroup(caps, "amp");

  it("finds an item by exact id, case-insensitively", () => {
    const exactMatch = findItem(ampGroup, "JC-120");
    const lowerCaseMatch = findItem(ampGroup, "jc-120");

    expect(exactMatch.id).toBe("JC-120");
    expect(lowerCaseMatch.id).toBe("JC-120");
  });

  it("finds an item by name prefix when id doesn't match", () => {
    const item = findItem(ampGroup, "Twi");

    expect(item.id).toBe("TWIN");
  });

  it("throws listing available item ids when not found", () => {
    const findMissingItem = () => findItem(ampGroup, "MISSING");

    expect(findMissingItem).toThrow('Unknown item "MISSING" in group "amp"');
    expect(findMissingItem).toThrow(/JC-120, TWIN/);
  });
});
