import { describe, it, expect } from "vitest";
import { presentPatch } from "../src/patch-view";

describe("presentPatch", () => {
  it("drops the duplicate subType from inside a block that mirrors it", () => {
    const view = presentPatch({
      name: "P",
      fx1: { type: "COMPRESSOR", subType: "ORANGE", params: { subType: "ORANGE", sustain: 35 } },
    });

    const fx1 = view.fx1 as { subType: string; params: Record<string, unknown> };
    expect(fx1.subType).toBe("ORANGE");
    expect(fx1.params).toEqual({ sustain: 35 });
  });

  it("leaves a block untouched when the inner selection does not mirror the outer one", () => {
    const block = { type: "X", subType: "A", params: { subType: "B", rate: 10 } };

    const view = presentPatch({ fx1: block });

    expect(view.fx1).toEqual(block);
  });

  it("leaves values without a mirror relationship untouched", () => {
    const input = {
      name: "P",                             // primitive
      chain: ["FX1"],                         // array: object but no subType
      amp: { type: "JC-120", gain: 50 },      // object, no subType
      fx2: { subType: "Z" },                  // subType but no params
      fx3: { subType: "Z", params: "nope" },  // subType but params is not an object
    };

    const view = presentPatch(input);

    expect(view).toEqual(input);
  });
});
