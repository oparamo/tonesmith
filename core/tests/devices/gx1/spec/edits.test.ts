import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/devices/gx1";
import type { Patch } from "../../../../src/devices/gx1";

/** Applies the paths to a real decoded patch the way a write does, then validates the result. */
const validateAfter = (patch: Patch, edits: Record<string, unknown>): string[] => {
  for (const [path, value] of Object.entries(edits)) {
    const parts = path.split(".");
    const leaf = parts.pop() ?? path;
    let target = patch as unknown as Record<string, unknown>;
    for (const part of parts) target = target[part] as Record<string, unknown>;
    target[leaf] = value;
  }
  return gx1.driver.validateFields(patch, edits);
};

/** A built patch these cases can edit, with an amp on it so an amp edit has somewhere to land. */
const patchWith = (spec: Record<string, unknown>): Patch =>
  gx1.driver.buildPatch({ name: "Edits", amp: { type: "TRNSPRNT" }, ...spec });

describe("validateFields", () => {
  it("accepts an edit in range", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT" } });

    expect(validateAfter(patch, { "amp.gain": 72 })).toEqual([]);
  });

  it("accepts an edit to a block that has no types of its own", () => {
    const patch = patchWith({ ns: { threshold: 20 } });

    expect(validateAfter(patch, { "ns.threshold": 40 })).toEqual([]);
  });

  it("rejects a string where the param takes a number, naming the param", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT" } });

    const issues = validateAfter(patch, { "amp.gain": "abc" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/gain/i);
    expect(issues[0]).toMatch(/abc/);
  });

  it("rejects a value below the param's range, naming the range", () => {
    const patch = patchWith({ odds: { type: "BLUES OD" } });

    const issues = validateAfter(patch, { "odds.tone": -500 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/tone/i);
    expect(issues[0]).toMatch(/-500/);
  });

  it("rejects a param of an fx slot's nested params bag", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = validateAfter(patch, { "fx1.params.sustain": 900 });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/sustain/i);
  });

  it("rejects a type the block's group does not have, listing the valid ones", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT" } });

    const issues = validateAfter(patch, { "amp.type": "NOT AN AMP" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/NOT AN AMP/);
    expect(issues[0]).toMatch(/TRNSPRNT/);
  });

  it("rejects a non-boolean bypass value", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT" } });

    const issues = validateAfter(patch, { "amp.on": "false" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/on/);
  });

  /**
   * TIME is a DELAY param and not a COMPRESSOR one, so this passes only because the block's type is
   * read after the batch rather than before it.
   */
  it("validates a param against the type set in the same batch", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = validateAfter(patch, {
      "fx1.type": "DELAY", "fx1.subType": "STANDARD", "fx1.params.time": 400,
    });

    expect(issues).toEqual([]);
  });

  /**
   * A dot-path edit sets one field at a time, so switching a type leaves the sub-model the previous
   * type chose. The codec has no field map for that pairing, so the mismatch has to be reported
   * rather than encoded.
   */
  it("rejects a type change that leaves the previous type's sub-model behind", () => {
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    const issues = validateAfter(patch, { "fx1.type": "DELAY" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/STANDARD/);
  });

  it("reports every bad edit in one pass rather than stopping at the first", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT" } });

    const issues = validateAfter(patch, { "amp.gain": 900, "amp.level": -1 });

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

    expect(validateAfter(patch, { [path]: value })).toHaveLength(1);
  });

  it("rejects switching a slot to OVERTONE when that slot cannot hold it", () => {
    const patch = patchWith({ fx1: { type: "TREMOLO" } });

    const issues = validateAfter(patch, { "fx1.type": "OVERTONE" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/fx3/);
  });

  it("accepts switching fx3 to OVERTONE", () => {
    const patch = patchWith({ fx3: { type: "TREMOLO" } });

    expect(validateAfter(patch, { "fx3.type": "OVERTONE" })).toEqual([]);
  });

  it("passes over a path the catalog says nothing about, leaving it to the codec", () => {
    const patch = patchWith({ amp: { type: "TRNSPRNT" } });

    expect(validateAfter(patch, { name: "Renamed" })).toEqual([]);
  });
});
