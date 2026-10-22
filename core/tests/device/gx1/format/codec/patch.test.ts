import { describe, it, expect } from "vitest";
import { decodePatch, encodePatch } from "../../../../../src/device/gx1/format/codec/patch";
import { decodeFxParams } from "../../../../../src/device/gx1/format/codec/fxParams";
import { bytesFromHex, hexFromBytes } from "../../../../../src/device/gx1/format/codec/primitives";
import { RAW, FX_TYPE_IDX } from "../../../../../src/device/gx1/model";
import type { RawParamSet } from "../../../../../src/device/gx1/model";
import { DEFAULT_INIT_FIXTURE, patchAt } from "../../helpers";
import { present } from "../../../../helpers";

const defaultInitPatch = await patchAt(DEFAULT_INIT_FIXTURE);
const defaultInitParamSet = defaultInitPatch[RAW];

/** The default-init param set with `key` left out, leaving the original untouched. */
const paramSetWithout = (key: string): RawParamSet => {
  const { [key]: _, ...rest } = defaultInitParamSet;
  return rest;
};

describe("decodePatch", () => {
  it("defaults memo to an empty string when the raw envelope omits it", () => {
    const decoded = decodePatch({ paramSet: defaultInitParamSet });

    expect(decoded.memo).toBe("");
  });

  it("throws naming a block it reads but the param set lacks", () => {
    const decodeIncomplete = () => decodePatch({ paramSet: paramSetWithout("MEMORY%AMP") });

    expect(decodeIncomplete).toThrow(/MEMORY%AMP/);
  });

  it("lifts an fx slot's sub-model onto block.subType, out of params", () => {
    const decoded = decodePatch({ paramSet: defaultInitParamSet });

    expect(decoded.fx1.subType).toBe("BOSS COMP");
    expect(decoded.fx1.params).not.toHaveProperty("subType");
  });

  it("reads fx3 OVERTONE from its dedicated MEMORY%FX3A block, and fx1 OVERTONE from the shared MEMORY%FX1 block", () => {
    const paramSet = { ...defaultInitParamSet };
    const fx1Com = bytesFromHex(present(paramSet["MEMORY%FX1_COM"], "MEMORY%FX1_COM"));
    fx1Com[1] = FX_TYPE_IDX.OVERTONE;
    paramSet["MEMORY%FX1_COM"] = hexFromBytes(fx1Com);
    const fx3Com = bytesFromHex(present(paramSet["MEMORY%FX3_COM"], "MEMORY%FX3_COM"));
    fx3Com[1] = FX_TYPE_IDX.OVERTONE;
    paramSet["MEMORY%FX3_COM"] = hexFromBytes(fx3Com);

    const decoded = decodePatch({ paramSet });

    expect(decoded.fx1.type).toBe("OVERTONE");
    expect(decoded.fx1.params).toStrictEqual(
      decodeFxParams("OVERTONE", bytesFromHex(present(paramSet["MEMORY%FX1"], "MEMORY%FX1")))
    );
    expect(decoded.fx3.type).toBe("OVERTONE");
    expect(decoded.fx3.params).toStrictEqual(
      decodeFxParams("OVERTONE", bytesFromHex(present(paramSet["MEMORY%FX3A"], "MEMORY%FX3A")))
    );
  });
});

describe("encodePatch", () => {
  it("passes through blocks it does not decode, untouched", () => {
    const paramSet = { ...defaultInitParamSet, "MEMORY%CTL": ["01", "02"], "MEMORY%ASGN1": ["FF"] };
    const patch = decodePatch({ paramSet });

    const encoded = encodePatch(patch);

    expect(encoded.paramSet["MEMORY%CTL"]).toStrictEqual(["01", "02"]);
    expect(encoded.paramSet["MEMORY%ASGN1"]).toStrictEqual(["FF"]);
  });

  it("writes memo through", () => {
    const patch = decodePatch({ memo: "original", paramSet: defaultInitParamSet });
    patch.memo = "changed";

    const encoded = encodePatch(patch);

    expect(encoded.memo).toBe("changed");
  });

  it("writes an fx slot's subType back into the param block", () => {
    const patch = decodePatch({ paramSet: defaultInitParamSet });
    patch.fx1.subType = "D-COMP";

    const redecoded = decodePatch(encodePatch(patch));

    expect(redecoded.fx1.subType).toBe("D-COMP");
  });

  // OVERTONE (FX3-only) stores its params in the separate MEMORY%FX3A block instead of the shared
  // 251-byte FX param block, so this proves both halves of that special-casing: the encoder writes
  // to FX3A and leaves FX3 alone.
  it("writes fx3 OVERTONE params into MEMORY%FX3A and leaves MEMORY%FX3 alone", () => {
    const paramSet = { ...defaultInitParamSet };
    const fx3Com = bytesFromHex(present(paramSet["MEMORY%FX3_COM"], "MEMORY%FX3_COM"));
    fx3Com[1] = FX_TYPE_IDX.OVERTONE;
    paramSet["MEMORY%FX3_COM"] = hexFromBytes(fx3Com);
    const patch = decodePatch({ paramSet });
    patch.fx3.params = { lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 };

    const encoded = encodePatch(patch);
    const redecoded = decodePatch(encoded);

    expect(redecoded.fx3.params).toStrictEqual({ lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 });
    expect(encoded.paramSet["MEMORY%FX3"]).toStrictEqual(paramSet["MEMORY%FX3"]);
  });

  // encodePatch reads the original bytes for MEMORY%CHAIN, MEMORY%OTHER and each fx slot's param
  // block straight off `patch[RAW]` rather than off a per-block RAW, since encodeChain/
  // encodeSettings/encodeFxParams all start from bytes the codec, not any one block, owns.
  it("throws naming a block it writes but the original param set lacks", () => {
    const patch = decodePatch({ paramSet: defaultInitParamSet });
    delete patch[RAW]["MEMORY%CHAIN"];

    const encodeWithMissingBlock = () => encodePatch(patch);

    expect(encodeWithMissingBlock).toThrow(/MEMORY%CHAIN/);
  });
});
