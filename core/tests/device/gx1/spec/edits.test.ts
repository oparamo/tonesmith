/**
 * The GX-1's wiring into core's edit engine: that its edits check against the GX-1 catalog and
 * re-seed through the GX-1 builder. The engine itself is specService's, tested against a catalog
 * of its own.
 */
import { describe, it, expect } from "vitest";
import * as gx1 from "../../../../src/device/gx1";
import type { Patch } from "../../../../src/device/gx1";
import type { FieldValue } from "../../../../src/model";

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

describe("applyEdits", () => {
  it("rejects switching a slot to OVERTONE when that slot cannot hold it", () => {
    const patch = patchWith({ fx1: { type: "TREMOLO" } });

    const issues = issuesFrom(patch, { "fx1.type": "OVERTONE" });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/fx3/);
  });

  it("leaves the new type's other controls at the values a built patch would have", () => {
    const built = patchWith({ fx1: { type: "DELAY", subType: "STANDARD", params: { time: 400 } } });
    const patch = patchWith({ fx1: { type: "COMPRESSOR" } });

    applyTo(patch, { "fx1.type": "DELAY", "fx1.subType": "STANDARD", "fx1.params.time": 400 });

    expect(patch.fx1.params).toStrictEqual(built.fx1.params);
    expect("sustain" in patch.fx1.params, "a control of the effect it stopped being").toBe(false);
  });
});
