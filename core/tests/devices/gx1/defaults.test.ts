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
import { blankPatch } from "../../../src/devices/gx1/tsl";
import { decodeFxParams } from "../../../src/devices/gx1/codec/fx-params";
import { decodeDelay, decodeReverb, decodePfx } from "../../../src/devices/gx1/codec/blocks";
import { bytesFromHex, hexFromBytes, lookupIndex } from "../../../src/devices/gx1/codec/primitives";
import {
  FX_TYPES, FX_DLY_TYPES, DLY_TYPES, REV_TYPES, PFX_TYPES,
  DLY_TYPE_IDX, REV_TYPE_IDX, PFX_TYPE_IDX,
  PARAM_SUBTYPE_EFFECTS, PFX_SUBTYPE_EFFECTS, SUB_TYPE_FIELD,
} from "../../../src/devices/gx1/common";
import { DEFAULTS_BY_TYPE, BLOCK_DEFAULTS, DEFAULT_SUBTYPES } from "../../../src/devices/gx1/defaults";
import type { Patch } from "../../../src/devices/gx1/types";
import { DEFAULT_INIT_FIXTURE, patchAt, rawBlock } from "../../helpers";

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
    swapped[1] = lookupIndex(typeIndex, type, "block type");
    out[type] = omit(decode(hexFromBytes(swapped)), ["on", "type"]);
  }
  return out;
};

const harvestFx = (fx1: number[], fx3a: number[]): BlockDefaults => {
  const out: BlockDefaults = {};
  for (const type of FX_TYPES) {
    if (type === "DELAY") continue; // per-sub-algorithm, harvested under fxDelay
    const bytes = type === "OVERTONE" ? fx3a : fx1;
    out[type] = omit(decodeFxParams(type, bytes), [SUB_TYPE_FIELD]);
  }
  return out;
};

const harvestFxDelay = (fx1: number[]): BlockDefaults => {
  const out: BlockDefaults = {};
  for (const subAlgo of FX_DLY_TYPES) {
    const bytes = [...fx1];
    bytes[FX_DELAY_SUBALGO_OFFSET] = FX_DLY_TYPES.indexOf(subAlgo);
    out[subAlgo] = omit(decodeFxParams("DELAY", bytes), [SUB_TYPE_FIELD]);
  }
  return out;
};

const harvestDefaults = (patch: Patch): Record<string, BlockDefaults> => {
  const fx1 = bytesFromHex(rawBlock(patch, "MEMORY%FX1"));
  return {
    fx: harvestFx(fx1, bytesFromHex(rawBlock(patch, "MEMORY%FX3A"))),
    fxDelay: harvestFxDelay(fx1),
    delay: harvestByTypeByte({
      bytes: bytesFromHex(rawBlock(patch, "MEMORY%DLY")),
      types: DLY_TYPES, typeIndex: DLY_TYPE_IDX, decode: decodeDelay,
    }),
    reverb: harvestByTypeByte({
      bytes: bytesFromHex(rawBlock(patch, "MEMORY%REV")),
      types: REV_TYPES, typeIndex: REV_TYPE_IDX, decode: decodeReverb,
    }),
    pfx: harvestByTypeByte({
      bytes: bytesFromHex(rawBlock(patch, "MEMORY%PFX")),
      types: PFX_TYPES, typeIndex: PFX_TYPE_IDX, decode: decodePfx,
    }),
  };
};

/**
 * An FX type's sub-model selection rides inside its own param window, so decoding the window at
 * rest yields the model the device opens on. `omit` drops it from the param defaults above, since
 * the builder resolves it before it can choose a field map rather than filling it afterwards.
 */
const harvestFxSubTypes = (fx1: number[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const type of FX_TYPES) {
    if (!PARAM_SUBTYPE_EFFECTS.has(type)) continue;
    const decoded = decodeFxParams(type, fx1);
    const selected = decoded[SUB_TYPE_FIELD];
    if (typeof selected === "string") out[type] = selected;
  }
  return out;
};

/** PFX carries its sub-model as an ordinary field, on the types PFX_SUBTYPE_EFFECTS names. */
const harvestPfxSubTypes = (pfx: number[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const type of PFX_SUBTYPE_EFFECTS) {
    const swapped = [...pfx];
    swapped[1] = lookupIndex(PFX_TYPE_IDX, type, "PFX type");
    const decoded = decodePfx(hexFromBytes(swapped)) as Record<string, unknown>;
    const selected = decoded[SUB_TYPE_FIELD];
    if (typeof selected === "string") out[type] = selected;
  }
  return out;
};

const harvestSubTypes = (patch: Patch): Record<string, Record<string, string>> => ({
  fx: harvestFxSubTypes(bytesFromHex(rawBlock(patch, "MEMORY%FX1"))),
  pfx: harvestPfxSubTypes(bytesFromHex(rawBlock(patch, "MEMORY%PFX"))),
});

/** The single-shape blocks are their own default: no type to swap, so the decoded block is it. */
const harvestBlockDefaults = (patch: Patch): Record<string, ParamDefaults> =>
  Object.fromEntries(
    (["amp", "odds", "ns", "fv"] as const).map(block => [block, omit(patch[block], ["on", "type"])])
  );

describe("GX-1 defaults ↔ fixture drift guard", () => {
  const patch = patchAt(DEFAULT_INIT_FIXTURE);

  it("DEFAULTS_BY_TYPE matches the factory defaults harvested from default-init.tsl", () => {
    expect(DEFAULTS_BY_TYPE).toEqual(harvestDefaults(patch));
  });

  it("DEFAULT_SUBTYPES matches the sub-models selected in default-init.tsl", () => {
    expect(DEFAULT_SUBTYPES).toEqual(harvestSubTypes(patch));
  });

  it("BLOCK_DEFAULTS matches the single-shape blocks in default-init.tsl", () => {
    expect(BLOCK_DEFAULTS).toEqual(harvestBlockDefaults(patch));
  });

  // A blank patch is documented as opening at the device's factory defaults, and create_patch_file
  // hands that straight to a caller. A drift here would have the amp open on at TRNSPRNT with LEVEL
  // 100, and the OD/DS block open all-zeroed, which decodes as MID BOOST at drive 0 and tone -50.
  it("blankPatch opens the single-shape blocks at those same defaults", () => {
    const blank = blankPatch("Blank");

    for (const block of ["amp", "odds", "ns", "fv"] as const) {
      expect(blank[block], `${block} should open at its factory default`).toEqual(patch[block]);
    }
  });

  // These blocks are preserved verbatim rather than decoded, so the guard reads their bytes. Zero
  // is a value here, not an absence: it sets memoryLevel to a silent 0 and bpm to 0, below the 40
  // the device accepts, and leaves every footswitch and assign slot unassigned.
  it("blankPatch opens the undecoded fixed-shape blocks at the factory bytes", () => {
    const blank = blankPatch("Blank");
    const assignSlots = Array.from({ length: 8 }, (_, slot) => `MEMORY%ASGN${slot + 1}`);

    for (const key of ["MEMORY%OTHER", "MEMORY%CTL", ...assignSlots]) {
      expect(rawBlock(blank, key), `${key} should open at its factory bytes`)
        .toEqual(rawBlock(patch, key));
    }
  });
});
