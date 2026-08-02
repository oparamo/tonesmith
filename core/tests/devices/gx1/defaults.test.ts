/**
 * Defaults drift guard.
 *
 * DEFAULTS_BY_TYPE (src/devices/gx1/defaults.ts) is a committed snapshot of every type's real
 * factory-default field values, lifted from default-init.tsl's shadow bytes (the union byte
 * region where every type of a block coexists; see FORMAT.md). This guard re-harvests the same
 * data from the fixture and asserts the committed const still matches it, so the two can't drift.
 *
 * To regenerate the const after a fixture change: temporarily log `harvestDefaults(patch)` (JSON)
 * and paste it into defaults.ts.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFile } from "../../../src/devices/gx1/tsl";
import { decodeFxParams } from "../../../src/devices/gx1/codec/fx-params";
import { decodeDelay, decodeReverb, decodePfx } from "../../../src/devices/gx1/codec/blocks";
import { bytesFromHex, hexFromBytes } from "../../../src/devices/gx1/codec/primitives";
import {
  FX_TYPES, FX_DLY_TYPES, DLY_TYPES, REV_TYPES, PFX_TYPES,
  DLY_TYPE_IDX, REV_TYPE_IDX, PFX_TYPE_IDX, RAW,
} from "../../../src/devices/gx1/common";
import { DEFAULTS_BY_TYPE } from "../../../src/devices/gx1/defaults";
import type { Patch } from "../../../src/devices/gx1/types";

const FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/default-init.tsl");

// The FX-slot DELAY's sub-algorithm selector, at absolute offset 212 within the FX block (FORMAT.md).
const FX_DELAY_SUBALGO_OFFSET = 212;

type ParamDefaults = Record<string, string | number>;
type BlockDefaults = Record<string, ParamDefaults>;

const omit = (obj: object, keys: string[]): ParamDefaults =>
  Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));

/** One block whose type selector is byte 1 (DLY/REV/PFX), and how to read it. */
interface TypeByteBlock {
  bytes: number[];
  types: readonly string[];
  typeIndex: Record<string, number>;
  decode: (hex: string[]) => object;
}

// Swap byte 1 to each type in turn and decode the shadow bytes behind it.
const harvestByTypeByte = (block: TypeByteBlock): BlockDefaults => {
  const { bytes, types, typeIndex, decode } = block;
  const out: BlockDefaults = {};
  for (const type of types) {
    const swapped = [...bytes];
    swapped[1] = typeIndex[type];
    out[type] = omit(decode(hexFromBytes(swapped)), ["on", "type"]);
  }
  return out;
};

const harvestFx = (fx1: number[], fx3a: number[]): BlockDefaults => {
  const out: BlockDefaults = {};
  for (const type of FX_TYPES) {
    if (type === "DELAY") continue; // per-sub-algorithm, harvested under fxDelay
    const bytes = type === "OVERTONE" ? fx3a : fx1;
    const decoded = decodeFxParams(type, bytes);
    if ("unknownBytes" in decoded) continue; // not modeled yet
    out[type] = omit(decoded, ["type"]);
  }
  return out;
};

const harvestFxDelay = (fx1: number[]): BlockDefaults => {
  const out: BlockDefaults = {};
  for (const subAlgo of FX_DLY_TYPES) {
    const bytes = [...fx1];
    bytes[FX_DELAY_SUBALGO_OFFSET] = FX_DLY_TYPES.indexOf(subAlgo);
    out[subAlgo] = omit(decodeFxParams("DELAY", bytes), ["type"]);
  }
  return out;
};

const harvestDefaults = (patch: Patch): Record<string, BlockDefaults> => {
  const fx1 = bytesFromHex(patch[RAW]["MEMORY%FX1"]);
  return {
    fx: harvestFx(fx1, bytesFromHex(patch[RAW]["MEMORY%FX3A"])),
    fxDelay: harvestFxDelay(fx1),
    delay: harvestByTypeByte({
      bytes: bytesFromHex(patch[RAW]["MEMORY%DLY"]),
      types: DLY_TYPES, typeIndex: DLY_TYPE_IDX, decode: decodeDelay,
    }),
    reverb: harvestByTypeByte({
      bytes: bytesFromHex(patch[RAW]["MEMORY%REV"]),
      types: REV_TYPES, typeIndex: REV_TYPE_IDX, decode: decodeReverb,
    }),
    pfx: harvestByTypeByte({
      bytes: bytesFromHex(patch[RAW]["MEMORY%PFX"]),
      types: PFX_TYPES, typeIndex: PFX_TYPE_IDX, decode: decodePfx,
    }),
  };
};

describe("GX-1 defaults ↔ fixture drift guard", () => {
  const patch = readFile(FIXTURE).patches[0];

  it("DEFAULTS_BY_TYPE matches the factory defaults harvested from default-init.tsl", () => {
    expect(DEFAULTS_BY_TYPE).toEqual(harvestDefaults(patch));
  });
});
