/**
 * A block keeps the raw param bytes it was decoded from, so a switched slot has to come back
 * through the codec as the type and values the edit asked for, not as the new type's fields read
 * over the old effect's bytes. This crosses edits, the builder, the codec and a committed fixture
 * on purpose.
 */
import { describe, it, expect } from "vitest";
import * as gx1 from "../../../src/device/gx1";
import type { Patch } from "../../../src/device/gx1";
import type { FieldValue } from "../../../src/model";
import { ROCK_TONES_FIXTURE, patchAt } from "../../device/gx1/helpers";
import { storedAs } from "../../helpers";

const applyTo = (patch: Patch, edits: Record<string, FieldValue>): Record<string, FieldValue> =>
  gx1.driver.applyEdits(patch, Object.entries(edits));

describe("applyEdits survives the round trip through the device's own bytes", () => {
  it("reads a switched slot back as the type and values the edit asked for", async () => {
    const patch = await patchAt(ROCK_TONES_FIXTURE);

    applyTo(patch, { "fx1.type": "DELAY", "fx1.subType": "STANDARD", "fx1.params.time": 400 });
    const reread = storedAs(gx1.driver, patch);

    expect(reread.fx1.type).toBe("DELAY");
    expect(reread.fx1.subType).toBe("STANDARD");
    expect(reread.fx1.params).toStrictEqual(patch.fx1.params);
  });
});
