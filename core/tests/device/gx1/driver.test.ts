import { describe, it, expect } from "vitest";
import { driver } from "../../../src/device/gx1/driver";
import { gx1Capabilities } from "../../../src/device/gx1/catalog/capabilities";
import { parseFile, serializeFile, newFile } from "../../../src/device/gx1/format/tsl";
import { buildPatch, applyEdits } from "../../../src/device/gx1/spec";
import { viewPatch } from "../../../src/device/gx1/view";

/** The driver's members as plain function properties, so referencing one for identity isn't a call. */
interface PlainDriverMembers {
  capabilities: typeof gx1Capabilities;
  parseFile: typeof parseFile;
  serializeFile: typeof serializeFile;
  newFile: typeof newFile;
  buildPatch: typeof buildPatch;
  applyEdits: typeof applyEdits;
  viewPatch: typeof viewPatch;
}
const plainDriver = driver as unknown as PlainDriverMembers;

describe("gx1 driver", () => {
  it("is registered under the id and name its files name", () => {
    expect(driver.id).toBe("gx1");
    expect(driver.name).toBe("BOSS GX-1");
  });

  it.each([
    { key: "capabilities", member: gx1Capabilities, wired: plainDriver.capabilities },
    { key: "parseFile", member: parseFile, wired: plainDriver.parseFile },
    { key: "serializeFile", member: serializeFile, wired: plainDriver.serializeFile },
    { key: "newFile", member: newFile, wired: plainDriver.newFile },
    { key: "buildPatch", member: buildPatch, wired: plainDriver.buildPatch },
    { key: "applyEdits", member: applyEdits, wired: plainDriver.applyEdits },
    { key: "viewPatch", member: viewPatch, wired: plainDriver.viewPatch },
  ])("wires $key to its module", ({ member, wired }) => {
    expect(wired).toBe(member);
  });
});
