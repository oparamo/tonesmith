import { describe, it, expect } from "vitest";
import { viewPatch } from "../../../src/device/gx1/view";
import { blankPatch } from "../../../src/device/gx1/format/tsl";
import { BLOCK_NAMES, BLOCK_LABELS } from "../../../src/device/gx1/model";
import type { Patch } from "../../../src/device/gx1/model";
import { present } from "../../helpers";

const detail = (patch: Patch, label: string): string | undefined =>
  viewPatch(patch).details.find(entry => entry.label === label)?.value;

describe("gx1 patch view", () => {
  it("lists the blocks in the order this patch runs them", () => {
    const patch = blankPatch("Reordered");
    patch.chain = ["amp", "drive", "fx1", "fx2", "fx3", "pedalFx", "noiseGate", "volume", "delay", "reverb"];

    const keys = viewPatch(patch).blocks.map(block => block.key);

    expect(keys).toStrictEqual(patch.chain);
  });

  // A chain decodes from a linked list that stops at its first terminator, so a file the unit did
  // not write can name fewer blocks than the patch stores. Every block still has settings to read.
  it("still shows a block the chain leaves out", () => {
    const patch = blankPatch("Test");
    patch.chain = ["amp"];

    const keys = viewPatch(patch).blocks.map(block => block.key);

    expect(keys).toStrictEqual(["amp", ...BLOCK_NAMES.filter(name => name !== "amp")]);
  });

  it("drops a chain entry naming something that is not a block, and still shows every real one", () => {
    const patch = blankPatch("Test");
    patch.chain = ["amp", "bogus", "drive"];

    const keys = viewPatch(patch).blocks.map(block => block.key);

    expect(keys).toStrictEqual(["amp", "drive", ...BLOCK_NAMES.filter(name => name !== "amp" && name !== "drive")]);
  });

  it("lists every block in BLOCK_NAMES order for an empty chain, with an empty Chain detail", () => {
    const patch = blankPatch("Test");
    patch.chain = [];

    const view = viewPatch(patch);

    expect(view.blocks.map(block => block.key)).toStrictEqual([...BLOCK_NAMES]);
    expect(detail(patch, "Chain")).toBe("");
  });

  it("labels each block the way the device's panel does", () => {
    const patch = blankPatch("Test");
    patch.chain = [...BLOCK_NAMES];

    const labels = viewPatch(patch).blocks.map(block => [block.key, block.label]);

    expect(labels).toStrictEqual(BLOCK_NAMES.map(name => [name, BLOCK_LABELS[name]]));
  });

  it("carries the chain and every patch setting as details", () => {
    const patch = blankPatch("Test");
    patch.chain = ["amp", "drive"];
    patch.memoryLevel = 100;
    patch.bpm = 120;
    patch.key = "E";
    patch.carryover = true;
    patch.tempoHold = false;

    expect(viewPatch(patch).details).toStrictEqual([
      { label: "Chain", value: "amp, drive" },
      { label: "Memory level", value: "100" },
      { label: "Tempo", value: "120 BPM" },
      { label: "Key", value: "E" },
      { label: "Carryover", value: "ON" },
      { label: "Tempo hold", value: "OFF" },
    ]);
  });

  it.each([
    { value: true, expected: "ON" },
    { value: false, expected: "OFF" },
  ])("reads carryover $value as $expected, not as true or false", ({ value, expected }) => {
    const patch = blankPatch("Test");
    patch.carryover = value;

    expect(detail(patch, "Carryover")).toBe(expected);
  });

  it("leaves Memo out when the memo is empty", () => {
    const patch = blankPatch("Test");

    expect(detail(patch, "Memo")).toBeUndefined();
  });

  it("shows the memo when there is one", () => {
    const patch = blankPatch("Test");
    patch.memo = "bridge pickup";

    expect(detail(patch, "Memo")).toBe("bridge pickup");
  });

  it("passes a block's on, type and subType through as the patch holds them", () => {
    const patch = blankPatch("Test");
    patch.fx1.on = false;
    patch.fx1.type = "CHORUS";
    patch.fx1.subType = "MONO";

    const fx1View = present(viewPatch(patch).blocks.find(block => block.key === "fx1"), "fx1 in the view");

    expect(fx1View).toMatchObject({ on: false, type: "CHORUS", subType: "MONO" });
  });

  it("leaves the volume block's on undefined, since the device can't bypass it", () => {
    const patch = blankPatch("Test");

    const volumeView = present(viewPatch(patch).blocks.find(block => block.key === "volume"), "volume in the view");

    expect(volumeView.on).toBeUndefined();
  });

  // The raw bytes ride along on every decoded block under a symbol key, and a spread would copy
  // them onto the view, where a renderer walking the block would print them.
  it("hands a renderer the block's controls and nothing else", () => {
    const patch = blankPatch("Test");
    const view = viewPatch(patch);
    const amp = present(view.blocks.find(block => block.key === "amp"), "the amp block in the view");

    expect(amp.params).toStrictEqual(patch.amp.params);
    expect(Object.getOwnPropertySymbols(amp)).toStrictEqual([]);
    expect(Object.keys(amp).sort()).toStrictEqual(["key", "label", "on", "params", "subType", "type"]);
  });
});
