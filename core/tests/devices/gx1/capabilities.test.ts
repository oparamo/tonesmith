/**
 * Drift guard: every id in each constants.ts lookup array must have a corresponding
 * CapabilityItem in gx1Capabilities. If you add a new entry to constants.ts without
 * updating capabilities.ts, these tests will fail.
 */
import { describe, it, expect } from "vitest";
import {
  FX_TYPES, AMP_TYPES, SP_TYPES, MIC_TYPES,
  ODDS_TYPES, DLY_TYPES, REV_TYPES,
  COMP_TYPES, LIM_TYPES, ACRESO_TYPES, CHORUS_TYPES, VIBE_MODES, HUM_MODES,
  PARAM_SUBTYPE_EFFECTS,
} from "../../../src/devices/gx1/common";
import { gx1Capabilities } from "../../../src/devices/gx1/capabilities";
import { FX_PARAM_MAPS } from "../../../src/devices/gx1/codec/fx-params";
import { PFX_TYPE_MAPS, DELAY_TYPE_MAPS, REV_TYPE_MAPS } from "../../../src/devices/gx1/codec/blocks";
import type { CapabilityItem } from "../../../src/types";

const groupItems = (groupId: string): CapabilityItem[] =>
  gx1Capabilities.groups.find(g => g.id === groupId)?.items ?? [];

// Normalizes a param/field name for comparison: lowercase, strip anything that isn't
// a letter or digit — so "PRE-DELAY" (capabilities) and "preDelay" (codec) match.
const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const codecFieldNames = (fields: readonly { name: string }[] | undefined): Set<string> =>
  new Set((fields ?? []).map(field => normalize(field.name)));

describe("GX-1 capabilities drift guard", () => {
  it("covers every FX_TYPES entry", () => {
    const fxIds = new Set(groupItems("fx").map(i => i.id));
    for (const type of FX_TYPES) {
      expect(fxIds, `FX_TYPES "${type}" is missing from capabilities.groups.fx`).toContain(type);
    }
  });

  it("covers every AMP_TYPES entry", () => {
    const ampIds = new Set(groupItems("amp").map(i => i.id));
    for (const type of AMP_TYPES) {
      expect(ampIds, `AMP_TYPES "${type}" is missing from capabilities.groups.amp`).toContain(type);
    }
  });

  it("covers every SP_TYPES entry", () => {
    const cabIds = new Set(groupItems("cab").map(i => i.id));
    for (const type of SP_TYPES) {
      expect(cabIds, `SP_TYPES "${type}" is missing from capabilities.groups.cab`).toContain(type);
    }
  });

  it("covers every MIC_TYPES entry", () => {
    const micIds = new Set(groupItems("mic").map(i => i.id));
    for (const type of MIC_TYPES) {
      expect(micIds, `MIC_TYPES "${type}" is missing from capabilities.groups.mic`).toContain(type);
    }
  });

  it("covers every ODDS_TYPES entry", () => {
    const oddsIds = new Set(groupItems("odds").map(i => i.id));
    for (const type of ODDS_TYPES) {
      expect(oddsIds, `ODDS_TYPES "${type}" is missing from capabilities.groups.odds`).toContain(type);
    }
  });

  it("covers every DLY_TYPES entry", () => {
    const dlyIds = new Set(groupItems("delay").map(i => i.id));
    for (const type of DLY_TYPES) {
      expect(dlyIds, `DLY_TYPES "${type}" is missing from capabilities.groups.delay`).toContain(type);
    }
  });

  it("covers every REV_TYPES entry", () => {
    const revIds = new Set(groupItems("reverb").map(i => i.id));
    for (const type of REV_TYPES) {
      expect(revIds, `REV_TYPES "${type}" is missing from capabilities.groups.reverb`).toContain(type);
    }
  });

  it("covers every PARAM_SUBTYPE_EFFECTS entry as subTypes of the corresponding FX item", () => {
    // These FX types store their own sub-model selector in the param block itself
    // (see PARAM_SUBTYPE_EFFECTS in common/constants.ts) rather than in FX_COM byte 2.
    const paramSubtypeTables: Record<string, readonly string[]> = {
      "COMPRESSOR":   COMP_TYPES,
      "LIMITER":      LIM_TYPES,
      "AC RESO":      ACRESO_TYPES,
      "CHORUS":       CHORUS_TYPES,
      "CLASSIC-VIBE": VIBE_MODES,
      "HUMANIZER":    HUM_MODES,
      "OD/DS":        ODDS_TYPES,
    };
    const fxItems = groupItems("fx");

    for (const [fxType, subTypes] of Object.entries(paramSubtypeTables)) {
      const fxItem = fxItems.find(i => i.id === fxType);
      expect(
        fxItem,
        `FX item "${fxType}" from PARAM_SUBTYPE_EFFECTS is missing from capabilities.groups.fx`
      ).toBeDefined();

      const itemSubTypeIds = new Set((fxItem?.subTypes ?? []).map(s => s.id));
      for (const subId of subTypes) {
        expect(
          itemSubTypeIds,
          `Subtype "${subId}" of FX type "${fxType}" is missing from capabilities`
        ).toContain(subId);
      }
    }
  });
});

// Semantic drift guard: capabilities.ts's declared params/subTypes must match what the
// codec actually decodes, not just share an id. Catches the class of bug where
// capabilities.ts and the codec's field maps drift apart silently (e.g. FIXED WAH's
// FREQ/wahType mismatch).
describe("GX-1 capabilities/codec semantic drift guard", () => {
  // Capability params with no direct codec field match, for a documented reason —
  // not drift. Every other param must normalize-match a real codec field name.
  const FX_PARAM_EXCEPTIONS: Record<string, Set<string>> = {
    // codec field is "octFeedback"; capabilities label matches the hardware's own knob text.
    "FEEDBACKER": new Set(["OCT F-BACK"]),
    // stage count (4/8/12) is derived from the codec's numeric "stage" field, not a lookup-named one.
    "PHASER": new Set(["TYPE"]),
    // codec field is "speed"; capabilities label matches the hardware's own knob text.
    "ROTARY": new Set(["SPEED SELECT"]),
    // KEY is the patch's global key (Patch.key), not a per-effect param.
    "HARMONIST": new Set(["KEY"]),
    // codec fields are "minus1Oct"/"minus2Oct"; capabilities labels match the hardware's own knob text.
    "OCTAVE": new Set(["-1 OCT", "-2 OCT"]),
    "HEAVY OCT": new Set(["-1 OCT", "-2 OCT"]),
  };

  it("every fx item's params match a codec field in FX_PARAM_MAPS", () => {
    for (const item of groupItems("fx")) {
      const codecFields = FX_PARAM_MAPS[item.id];
      expect(codecFields, `FX item "${item.id}" has no FX_PARAM_MAPS entry`).toBeDefined();

      const codecNames = codecFieldNames(codecFields);
      const exceptions = FX_PARAM_EXCEPTIONS[item.id] ?? new Set<string>();
      for (const param of item.params ?? []) {
        if (exceptions.has(param.name)) continue;
        expect(
          codecNames,
          `FX item "${item.id}" param "${param.name}" has no matching codec field in FX_PARAM_MAPS["${item.id}"]`
        ).toContain(normalize(param.name));
      }
    }
  });

  it("every fx item with subTypes is registered in PARAM_SUBTYPE_EFFECTS", () => {
    for (const item of groupItems("fx")) {
      if (!item.subTypes || item.subTypes.length === 0) continue;
      expect(
        PARAM_SUBTYPE_EFFECTS.has(item.id),
        `FX item "${item.id}" has subTypes but is missing from PARAM_SUBTYPE_EFFECTS`
      ).toBe(true);
    }
  });

  it("every pfx item's params match a codec field in PFX_TYPE_MAPS", () => {
    for (const item of groupItems("pfx")) {
      const codecFields = PFX_TYPE_MAPS[item.id];
      expect(codecFields, `PFX item "${item.id}" has no PFX_TYPE_MAPS entry`).toBeDefined();

      const codecNames = codecFieldNames(codecFields);
      for (const param of item.params ?? []) {
        expect(
          codecNames,
          `PFX item "${item.id}" param "${param.name}" has no matching codec field in PFX_TYPE_MAPS["${item.id}"]`
        ).toContain(normalize(param.name));
      }
    }
  });

  it("delay group params match a codec field in some DELAY_TYPE_MAPS entry", () => {
    const allDelayFields = new Set(
      Object.values(DELAY_TYPE_MAPS).flatMap(fields => [...codecFieldNames(fields)])
    );
    const delayParams = gx1Capabilities.groups.find(g => g.id === "delay")?.params ?? [];
    for (const param of delayParams) {
      expect(
        allDelayFields,
        `Delay group param "${param.name}" has no matching codec field in any DELAY_TYPE_MAPS entry`
      ).toContain(normalize(param.name));
    }
  });

  it("reverb group params match a codec field in some REV_TYPE_MAPS entry", () => {
    const allReverbFields = new Set(
      Object.values(REV_TYPE_MAPS).flatMap(fields => [...codecFieldNames(fields)])
    );
    const reverbParams = gx1Capabilities.groups.find(g => g.id === "reverb")?.params ?? [];
    for (const param of reverbParams) {
      expect(
        allReverbFields,
        `Reverb group param "${param.name}" has no matching codec field in any REV_TYPE_MAPS entry`
      ).toContain(normalize(param.name));
    }
  });
});
