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
} from "../../../src/devices/gx1/common";
import { gx1Capabilities } from "../../../src/devices/gx1/capabilities";
import type { CapabilityItem } from "../../../src/types";

const groupItems = (groupId: string): CapabilityItem[] =>
  gx1Capabilities.groups.find(g => g.id === groupId)?.items ?? [];

const allSubTypeIds = (items: CapabilityItem[]): Set<string> => {
  const ids = new Set<string>();
  for (const item of items) {
    for (const sub of item.subTypes ?? []) {
      ids.add(sub.id);
    }
  }
  return ids;
};

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
    const subTypeMap = allSubTypeIds(fxItems);

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
      // suppress "used before assigned" lint note for subTypeMap
      void subTypeMap;
    }
  });
});
