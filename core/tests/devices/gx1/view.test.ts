import { describe, it, expect } from "vitest";
import { driver } from "../../../src/devices/gx1/driver";
import { viewPatch } from "../../../src/devices/gx1/view";
import { BLOCK_NAMES } from "../../../src/devices/gx1/common";
import { ROCK_TONES_FIXTURE as FIXTURE, patchAt, present } from "../../helpers";

const detail = (patch: ReturnType<typeof patchAt>, label: string): string | undefined =>
  viewPatch(patch).details.find(entry => entry.label === label)?.value;

describe("gx1 patch view", () => {
  it("lists the blocks in the order this patch runs them", () => {
    const patch = driver.buildPatch({
      name: "Reordered",
      chain: ["amp", "drive", "fx1", "fx2", "fx3", "pedalFx", "noiseGate", "volume", "delay", "reverb"],
      amp: { type: "JC-120" },
    });

    const keys = viewPatch(patch).blocks.map(block => block.key);

    expect(keys).toEqual(patch.chain);
  });

  // A chain decodes from a linked list that stops at its first terminator, so a file the unit did
  // not write can name fewer blocks than the patch stores. Every block still has settings to read.
  it("still shows a block the chain leaves out", () => {
    const patch = patchAt(FIXTURE);
    patch.chain = ["amp"];

    const keys = viewPatch(patch).blocks.map(block => block.key);

    expect(keys[0]).toBe("amp");
    expect(new Set(keys)).toEqual(new Set(BLOCK_NAMES));
  });

  it("labels each block the way the device's panel does", () => {
    const drive = viewPatch(patchAt(FIXTURE)).blocks.find(block => block.key === "drive");

    expect(present(drive, "the drive block in the view").label).toBe("OD/DS");
  });

  it("carries the chain and the patch key as details", () => {
    const patch = patchAt(FIXTURE);

    expect(detail(patch, "Chain")).toBe(patch.chain.join(", "));
    expect(detail(patch, "Key")).toBe(patch.key);
  });

  it("carries a memo only when the patch has one", () => {
    const patch = driver.blankPatch("Test");

    expect(detail(patch, "Memo")).toBeUndefined();

    patch.memo = "bridge pickup";

    expect(detail(patch, "Memo")).toBe("bridge pickup");
  });

  // The raw bytes ride along on every decoded block under a symbol key, and a spread would copy
  // them onto the view, where a renderer walking the block would print them.
  it("hands a renderer the block's controls and nothing else", () => {
    const patch = patchAt(FIXTURE);
    const view = viewPatch(patch);
    const amp = present(view.blocks.find(block => block.key === "amp"), "the amp block in the view");

    expect(amp.params).toEqual(patch.amp.params);
    expect(Object.getOwnPropertySymbols(amp)).toEqual([]);
    expect(Object.keys(amp).sort()).toEqual(["key", "label", "on", "params", "subType", "type"]);
  });
});
