/**
 * The driver's dot-path edit surface: where a path lands, what the value becomes once it lands
 * there, and which results the device refuses to store.
 */
import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/devices/gx1";
import type { Patch } from "../../../../src/devices/gx1";
import type { FieldValue } from "../../../../src/types";
import { ROCK_TONES_FIXTURE, patchAt } from "../../../helpers";

/** A built patch these cases can edit, with an amp on it so an amp edit has somewhere to land. */
const patchWith = (spec: Record<string, unknown>): Patch =>
  gx1.driver.buildPatch({ name: "Edits", amp: { type: "TRNSPRNT" }, ...spec });

const applyTo = (patch: Patch, edits: Record<string, FieldValue>): Record<string, FieldValue> =>
  gx1.driver.applyEdits(patch, Object.entries(edits));

/** Every problem one batch reports: they arrive together, as the lines of a single thrown message. */
const issuesFrom = (patch: Patch, edits: Record<string, FieldValue>): string[] => {
  try {
    applyTo(patch, edits);
    return [];
  } catch (error) {
    return (error as Error).message.split("\n");
  }
};

/** Reaches a decoded block's field by the same path a caller writes, for reading the result back. */
const valueAt = (patch: Patch, path: string): unknown => {
  let current = patch as unknown as Record<string, unknown>;
  const parts = path.split(".");
  const leaf = parts.pop() ?? path;
  for (const part of parts) current = current[part] as Record<string, unknown>;
  return current[leaf];
};

describe("applyEdits", () => {
  it("writes a patch setting, which belongs to no block", () => {
    const patch = patchWith({});

    const applied = applyTo(patch, { bpm: 140 });

    expect(patch.bpm).toBe(140);
    expect(applied).toEqual({ bpm: 140 });
  });

  // A setting names no block, so the per-block check never sees it. Without a check of its own the
  // value reaches the encoder, which knows a byte index and not the field a caller typed.
  it("rejects a patch setting the device cannot store, naming it and its range", () => {
    const patch = patchWith({});

    const [issue] = issuesFrom(patch, { bpm: 12 });

    expect(issue).toContain("BPM");
    expect(issue).toContain("40");
  });

  it("writes a value the device accepts and reports what landed", () => {
    const patch = patchWith({});

    const applied = applyTo(patch, { "amp.params.gain": 72 });

    expect(valueAt(patch, "amp.params.gain")).toBe(72);
    expect(applied).toEqual({ "amp.params.gain": 72 });
  });

  it("applies a whole batch in order, leaving the fields it was not given alone", () => {
    const patch = patchWith({});
    const levelBefore = valueAt(patch, "amp.params.level");

    applyTo(patch, { name: "Renamed", "amp.on": false, "amp.params.gain": 40 });

    expect(patch.name).toBe("Renamed");
    expect(valueAt(patch, "amp.on")).toBe(false);
    expect(valueAt(patch, "amp.params.gain")).toBe(40);
    expect(valueAt(patch, "amp.params.level")).toBe(levelBefore);
  });

  it("accepts an edit to a block that has no types of its own", () => {
    const patch = patchWith({ noiseGate: { params: { threshold: 20 } } });

    expect(issuesFrom(patch, { "noiseGate.params.threshold": 40 })).toEqual([]);
  });
});

/**
 * A command line can express a number no other way, so a string arriving at a numeric field is read
 * as one. What the field already holds is the only thing that says whether to.
 */
describe("applyEdits reads a value into the field it lands in", () => {
  it.each([
    { path: "amp.params.gain", given: "72", expected: 72 },
    { path: "amp.params.gain", given: "0", expected: 0 },
    { path: "amp.on", given: "true", expected: true },
    { path: "amp.on", given: "false", expected: false },
  ])("reads $given into $path as $expected", ({ path, given, expected }) => {
    const patch = patchWith({});

    applyTo(patch, { [path]: given });

    expect(valueAt(patch, path)).toBe(expected);
  });

  // A tempo-synced control holds a note value where it otherwise holds a number, so reading the
  // string it currently holds as proof of a text field would strand it there: no command line
  // could ever set it back to milliseconds.
  it("syncs a delay time to a note and takes it back off again", () => {
    const patch = patchWith({ delay: { type: "STANDARD" } });

    applyTo(patch, { "delay.params.time": "1/4" });
    expect(valueAt(patch, "delay.params.time"), "the note it was synced to").toBe("1/4");

    applyTo(patch, { "delay.params.time": "500" });
    expect(valueAt(patch, "delay.params.time"), "and a plain time after it").toBe(500);
  });

  it("leaves a numeric-looking name a string, since the field it lands in holds one", () => {
    const patch = patchWith({});

    applyTo(patch, { name: "1984" });

    expect(patch.name).toBe("1984");
  });

  it("takes a value that arrives already typed, not only its string form", () => {
    const patch = patchWith({});

    applyTo(patch, { "amp.params.gain": 72, "amp.on": false });

    expect(valueAt(patch, "amp.params.gain")).toBe(72);
    expect(valueAt(patch, "amp.on")).toBe(false);
  });
});

/**
 * A decoded patch carries every field the device supports, so a path that isn't on it names a
 * control the GX-1 doesn't have. Writing it anyway would be dropped by the encoder, which emits
 * only byte indices it knows, leaving the caller believing the edit landed.
 */
describe("applyEdits rejects a path the device has no field for", () => {
  it("names the field it could not find and the ones the level really has", () => {
    const patch = patchWith({});

    const issues = issuesFrom(patch, { "amp.params.presence": 1 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/presence/);
    expect(issues[0]).toMatch(/gain/);
  });

  it("rejects a control written beside the block's selectors rather than inside params", () => {
    const patch = patchWith({});

    expect(issuesFrom(patch, { "amp.gain": 1 })).toHaveLength(1);
  });

  it("rejects an unknown top-level field, leaving the patch as it was", () => {
    const patch = patchWith({});

    expect(issuesFrom(patch, { setName: "x" })).toHaveLength(1);
    expect("setName" in patch).toBe(false);
  });

  it("rejects a path walking through a block the device doesn't have", () => {
    const patch = patchWith({});

    expect(issuesFrom(patch, { "nope.params.rate": 1 })).toHaveLength(1);
  });

  it("rejects a path reaching past a value that holds no fields", () => {
    const patch = patchWith({});

    const issues = issuesFrom(patch, { "amp.params.gain.deeper": 1 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/amp\.params\.gain/);
  });
});

describe("applyEdits rejects a value the device cannot store", () => {
  it("rejects a string where the param takes a number, naming the param", () => {
    const patch = patchWith({});

    const issues = issuesFrom(patch, { "amp.params.gain": "abc" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/gain/i);
    expect(issues[0]).toMatch(/abc/);
  });

  it("rejects a value below the param's range, naming the range", () => {
    const patch = patchWith({ drive: { type: "BLUES OD" } });

    const issues = issuesFrom(patch, { "drive.params.tone": -500 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/tone/i);
    expect(issues[0]).toMatch(/-500/);
  });

  it("rejects a param of an fx slot's nested params bag", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = issuesFrom(patch, { "fx1.params.sustain": 900 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/sustain/i);
  });

  it("rejects a type the block's group does not have, listing the valid ones", () => {
    const patch = patchWith({});

    const issues = issuesFrom(patch, { "amp.type": "NOT AN AMP" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/NOT AN AMP/);
    expect(issues[0]).toMatch(/TRNSPRNT/);
  });

  it("rejects a non-boolean bypass value", () => {
    const patch = patchWith({});

    const issues = issuesFrom(patch, { "amp.on": 2 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/on/);
  });

  it("reports every problem in one pass rather than stopping at the first", () => {
    const patch = patchWith({});

    const issues = issuesFrom(patch, { "amp.params.gain": 900, "amp.params.level": -1 });

    expect(issues).toHaveLength(2);
  });

  /** A path that resolves nowhere and a value out of range are one answer to the caller. */
  it("reports a bad path alongside a bad value", () => {
    const patch = patchWith({});

    const issues = issuesFrom(patch, { "amp.params.presence": 1, "amp.params.gain": 900 });

    expect(issues).toHaveLength(2);
  });

  /** Each of these params carries a compact display, which is not on its own something to check against. */
  it.each([
    { label: "a LIMITER ratio the byte cannot hold", type: "LIMITER", path: "fx1.params.ratio", value: "4:1" },
    { label: "a LIMITER ratio above the device's range", type: "LIMITER", path: "fx1.params.ratio", value: 20 },
    { label: "a SLICER pattern that is not in the table", type: "SLICER", path: "fx1.params.pattern", value: "P99" },
    { label: "a HARMONIST harmony that is not in the table", type: "HARMONIST", path: "fx1.params.harmony", value: "wobble" },
  ])("rejects $label", ({ type, path, value }) => {
    const patch = patchWith({ fx1: { type } });

    expect(issuesFrom(patch, { [path]: value })).toHaveLength(1);
  });

  it("rejects switching a slot to OVERTONE when that slot cannot hold it", () => {
    const patch = patchWith({ fx1: { type: "TREMOLO" } });

    const issues = issuesFrom(patch, { "fx1.type": "OVERTONE" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/fx3/);
  });

  it("accepts switching fx3 to OVERTONE", () => {
    const patch = patchWith({ fx3: { type: "TREMOLO" } });

    expect(issuesFrom(patch, { "fx3.type": "OVERTONE" })).toEqual([]);
  });
});

describe("applyEdits reads each block's selection off the patch it just edited", () => {
  /**
   * The block is re-seeded as the type lands, so TIME is a field of the slot by the time the path
   * naming it resolves. Before that it was not, and the batch every caller writes was rejected for
   * naming a control of the effect it was asking for.
   */
  it("switches a type and sets a control of the new type in one batch", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = issuesFrom(patch, {
      "fx1.type": "DELAY", "fx1.subType": "STANDARD", "fx1.params.time": 400,
    });

    expect(issues).toEqual([]);
    expect(patch.fx1.type).toBe("DELAY");
    expect(patch.fx1.subType).toBe("STANDARD");
    expect(valueAt(patch, "fx1.params.time")).toBe(400);
  });

  /**
   * The two write paths have to agree about what a block set to a type holds: whatever the switch
   * leaves behind is what the codec reads back under the new type's field map, which is how a
   * compressor's sustain byte came back as a delay time nobody chose.
   */
  it("leaves the new type's other controls at the values a built patch would have", () => {
    const built = patchWith({ fx1: { type: "DELAY", subType: "STANDARD", params: { time: 400 } } });
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    applyTo(patch, { "fx1.type": "DELAY", "fx1.subType": "STANDARD", "fx1.params.time": 400 });

    expect(patch.fx1.params).toEqual(built.fx1.params);
    expect("sustain" in patch.fx1.params, "a control of the effect it stopped being").toBe(false);
  });

  it("takes a type change on its own, arriving on the device's factory sub-model", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    expect(issuesFrom(patch, { "fx1.type": "DELAY" })).toEqual([]);
    expect(patch.fx1.subType).toBe("STANDARD");
  });

  /** One fx type keeps a field map per sub-model, so switching that is a switch of controls too. */
  it("re-seeds a sub-model that decides which controls the block has", () => {
    const patch = patchWith({ fx1: { type: "DELAY", subType: "STANDARD" } });

    const issues = issuesFrom(patch, { "fx1.subType": "GLITCH", "fx1.params.glitch": 50 });

    expect(issues).toEqual([]);
    expect(valueAt(patch, "fx1.params.glitch")).toBe(50);
    expect("highCut" in patch.fx1.params, "a control of the sub-model it left").toBe(false);
  });

  /** Every model of an effect shares one set of controls, so picking another has to keep them. */
  it("keeps the controls a sub-model shares with the rest of its type", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR", params: { sustain: 30 } } });

    applyTo(patch, { "fx1.subType": "D-COMP" });

    expect(valueAt(patch, "fx1.params.sustain")).toBe(30);
  });

  it("rejects a control of the type the block was switched away from", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = issuesFrom(patch, { "fx1.type": "DELAY", "fx1.params.sustain": 30 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/sustain/);
  });

  /** Paths resolve in the order given, which is the honest reading of a sequence of edits. */
  it("rejects a control of the new type named before the type that has it", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = issuesFrom(patch, { "fx1.params.time": 400, "fx1.type": "DELAY" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/time/);
  });

  /** An amp has the same controls whichever amp it models, so a switch has no controls to discard. */
  it("keeps a block's controls when its types all share one set", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT", params: { gain: 72 } } });

    applyTo(patch, { "amp.type": "NATURAL" });

    expect(valueAt(patch, "amp.params.gain")).toBe(72);
  });

  it("leaves a block the batch did not switch alone", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT", params: { gain: 72 } } });

    applyTo(patch, { "fx1.type": "DELAY" });

    expect(valueAt(patch, "amp.params.gain")).toBe(72);
  });

  it("passes over a path the catalog says nothing about, leaving it to the codec", () => {
    const patch = patchWith({});

    expect(issuesFrom(patch, { name: "Renamed" })).toEqual([]);
  });
});

/**
 * The check the reinterpreted bytes would have failed: a switched slot has to survive the bytes.
 * A block keeps the raw param bytes it was decoded from, so a type change that only moved the type
 * byte read back as the new type's fields over the old effect's values, which is a valid file
 * carrying values nobody chose.
 */
describe("applyEdits survives the round trip through the device's own bytes", () => {
  it("reads a switched slot back as the type and values the edit asked for", () => {
    const patch = patchAt(ROCK_TONES_FIXTURE);

    applyTo(patch, { "fx1.type": "DELAY", "fx1.subType": "STANDARD", "fx1.params.time": 400 });
    const reread = gx1.driver.decodePatch(gx1.driver.encodePatch(patch));

    expect(reread.fx1.type).toBe("DELAY");
    expect(reread.fx1.subType).toBe("STANDARD");
    expect(reread.fx1.params).toEqual(patch.fx1.params);
  });
});
