import { describe, it, expect } from "vitest";
import type { DeviceCapabilities } from "../src/types";
import { findGroup, findType } from "../src/capability-utils";

const caps: DeviceCapabilities = {
  chain: { description: "Signal chain", defaultOrder: ["amp", "delay"], blocks: {} },
  patchName: { maxLength: 16 },
  patchSettings: [],
  groups: [
    {
      id: "amp",
      name: "Amp",
      description: "Amplifier block",
      types: [
        { id: "JC-120", name: "JC-120", description: "Clean amp" },
        { id: "TWIN", name: "Twin", description: "Fender-style amp" },
      ],
    },
    {
      id: "delay",
      name: "Delay",
      description: "Delay block",
      types: [
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
    const group = findGroup(caps, "AMP");

    expect(group.id).toBe("amp");
  });

  it("throws listing available group ids when not found", () => {
    const findMissingGroup = () => findGroup(caps, "reverb");

    expect(findMissingGroup).toThrow(/reverb/);
    expect(findMissingGroup, "names the groups that do exist").toThrow(/amp, delay/);
  });
});

describe("findType", () => {
  const ampGroup = findGroup(caps, "amp");

  it("finds a type by id regardless of case", () => {
    const found = findType(ampGroup, "jc-120");

    expect(found.id).toBe("JC-120");
  });

  it("finds a type by name prefix when id doesn't match", () => {
    const found = findType(ampGroup, "Twi");

    expect(found.id).toBe("TWIN");
  });

  it("throws listing available type ids when not found", () => {
    const findMissingType = () => findType(ampGroup, "MISSING");

    expect(findMissingType).toThrow(/MISSING/);
    expect(findMissingType, "names the types that do exist").toThrow(/JC-120, TWIN/);
  });
});
