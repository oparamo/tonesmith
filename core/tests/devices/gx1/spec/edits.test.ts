/**
 * The driver's dot-path edit surface: where a path lands, what the value becomes once it lands
 * there, and which results the device refuses to store.
 */
import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/devices/gx1";
import type { Patch } from "../../../../src/devices/gx1";
import type { FieldValue } from "../../../../src/types";

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
   * An edit reaches a field the block already carries, and a block carries only its current type's
   * controls, so TIME has nowhere to land while the slot is a COMPRESSOR: switching an effect is
   * `buildPatch`'s job, not a dot-path's. The batch is still read as one state, which is what lets
   * the two selectors below be judged together.
   */
  it("rejects a param of a type the block is only being switched to in the same batch", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = issuesFrom(patch, {
      "fx1.type": "DELAY", "fx1.subType": "STANDARD", "fx1.params.time": 400,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/time/);
  });

  /**
   * A dot-path edit sets one field at a time, so switching a type leaves the sub-model the previous
   * type chose. The codec has no field map for that pairing, so the mismatch has to be reported
   * rather than encoded.
   */
  it("rejects a type change that leaves the previous type's sub-model behind", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = issuesFrom(patch, { "fx1.type": "DELAY" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/STANDARD/);
  });

  it("passes over a path the catalog says nothing about, leaving it to the codec", () => {
    const patch = patchWith({});

    expect(issuesFrom(patch, { name: "Renamed" })).toEqual([]);
  });
});
