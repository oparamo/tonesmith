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
import {
  PFX_TYPE_MAPS, DELAY_TYPE_MAPS, REV_TYPE_MAPS,
  decodeAmp, decodeOdDs, decodeNs, decodeFv,
} from "../../../src/devices/gx1/codec/blocks";
import { hexFromBytes } from "../../../src/devices/gx1/codec/primitives";
import type { CapabilityItem } from "../../../src/types";

const groupItems = (groupId: string): CapabilityItem[] =>
  gx1Capabilities.groups.find(group => group.id === groupId)?.items ?? [];

// Normalizes a param/field name for comparison: lowercase, strip anything that isn't
// a letter or digit — so "PRE-DELAY" (capabilities) and "preDelay" (codec) match.
const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const codecFieldNames = (fields: readonly { name: string }[] | undefined): Set<string> =>
  new Set((fields ?? []).map(field => normalize(field.name)));

describe("GX-1 capabilities drift guard", () => {
  it("covers every FX_TYPES entry", () => {
    const fxIds = new Set(groupItems("fx").map(item => item.id));

    for (const type of FX_TYPES) {
      expect(fxIds, `FX_TYPES "${type}" is missing from capabilities.groups.fx`).toContain(type);
    }
  });

  it("covers every AMP_TYPES entry", () => {
    const ampIds = new Set(groupItems("amp").map(item => item.id));

    for (const type of AMP_TYPES) {
      expect(ampIds, `AMP_TYPES "${type}" is missing from capabilities.groups.amp`).toContain(type);
    }
  });

  it("covers every SP_TYPES entry", () => {
    const cabIds = new Set(groupItems("cab").map(item => item.id));

    for (const type of SP_TYPES) {
      expect(cabIds, `SP_TYPES "${type}" is missing from capabilities.groups.cab`).toContain(type);
    }
  });

  it("covers every MIC_TYPES entry", () => {
    const micIds = new Set(groupItems("mic").map(item => item.id));

    for (const type of MIC_TYPES) {
      expect(micIds, `MIC_TYPES "${type}" is missing from capabilities.groups.mic`).toContain(type);
    }
  });

  it("covers every ODDS_TYPES entry", () => {
    const oddsIds = new Set(groupItems("odds").map(item => item.id));

    for (const type of ODDS_TYPES) {
      expect(oddsIds, `ODDS_TYPES "${type}" is missing from capabilities.groups.odds`).toContain(type);
    }
  });

  it("covers every DLY_TYPES entry", () => {
    const dlyIds = new Set(groupItems("delay").map(item => item.id));

    for (const type of DLY_TYPES) {
      expect(dlyIds, `DLY_TYPES "${type}" is missing from capabilities.groups.delay`).toContain(type);
    }
  });

  it("covers every REV_TYPES entry", () => {
    const revIds = new Set(groupItems("reverb").map(item => item.id));

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
      const fxItem = fxItems.find(item => item.id === fxType);
      expect(
        fxItem,
        `FX item "${fxType}" from PARAM_SUBTYPE_EFFECTS is missing from capabilities.groups.fx`
      ).toBeDefined();

      const itemSubTypeIds = new Set((fxItem?.subTypes ?? []).map(subType => subType.id));
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
  // Fields whose codec name and capabilities label deliberately differ in wording — not
  // drift. Maps FX type -> codec field name -> the capabilities param name it corresponds to.
  const FX_FIELD_ALIASES: Record<string, Record<string, string>> = {
    // codec field is "octFeedback"; capabilities label matches the hardware's own knob text.
    "FEEDBACKER": { octFeedback: "OCT F-BACK" },
    // stage count (4/8/12) is derived from the codec's numeric "stage" field, not a lookup-named one.
    "PHASER": { stage: "TYPE" },
    // codec field is "speed"; capabilities label matches the hardware's own knob text.
    "ROTARY": { speed: "SPEED SELECT" },
    // codec fields are "minus1Oct"/"minus2Oct"; capabilities labels match the hardware's own knob text.
    "OCTAVE": { minus1Oct: "-1 OCT", minus2Oct: "-2 OCT" },
    "HEAVY OCT": { minus1Oct: "-1 OCT", minus2Oct: "-2 OCT" },
  };

  // Capability params with no codec field at all, for a documented reason — not drift.
  const FX_PARAM_ONLY_EXCEPTIONS: Record<string, Set<string>> = {
    // KEY is the patch's global key (Patch.key), not a per-effect param.
    "HARMONIST": new Set(["KEY"]),
  };

  const aliasTargets = (fxType: string): Set<string> =>
    new Set(Object.values(FX_FIELD_ALIASES[fxType] ?? {}));

  it("every fx item's params match a codec field in FX_PARAM_MAPS", () => {
    for (const item of groupItems("fx")) {
      const codecFields = FX_PARAM_MAPS[item.id];
      expect(codecFields, `FX item "${item.id}" has no FX_PARAM_MAPS entry`).toBeDefined();
      if (!codecFields) continue;

      const codecNames = codecFieldNames(codecFields);
      const targets = aliasTargets(item.id);
      const paramOnlyExceptions = FX_PARAM_ONLY_EXCEPTIONS[item.id] ?? new Set<string>();

      for (const param of item.params ?? []) {
        const matches = paramOnlyExceptions.has(param.name)
          || codecNames.has(normalize(param.name))
          || targets.has(param.name);
        expect(
          matches,
          `FX item "${item.id}" param "${param.name}" has no matching codec field in FX_PARAM_MAPS["${item.id}"]`
        ).toBe(true);
      }
    }
  });

  // The reverse direction: every codec field FX_PARAM_MAPS actually decodes must be
  // documented as a capabilities param, or describe_device/the CLI under-report it (the
  // bug that left CHORUS/FLANGER/PHASER/ROTARY's DIRECT param undocumented).
  it("every codec field in FX_PARAM_MAPS has a matching fx item param", () => {
    for (const item of groupItems("fx")) {
      const codecFields = FX_PARAM_MAPS[item.id];
      if (!codecFields) continue;

      const normalizedParamNames = new Set((item.params ?? []).map(param => normalize(param.name)));
      const aliases = FX_FIELD_ALIASES[item.id] ?? {};

      for (const field of codecFields) {
        if (field.name === "type") continue;
        const matches = normalizedParamNames.has(normalize(field.name)) || field.name in aliases;
        expect(
          matches,
          `FX item "${item.id}" codec field "${field.name}" is missing from its capabilities params`
        ).toBe(true);
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

  it("every codec field in PFX_TYPE_MAPS has a matching pfx item param", () => {
    // wahType is WAH's own sub-model selector, modeled via subTypes (CRY WAH, VO WAH, ...)
    // rather than a params entry — same treatment as FX's "type" field.
    const PFX_FIELD_EXCEPTIONS = new Set(["wahType"]);

    for (const item of groupItems("pfx")) {
      const codecFields = PFX_TYPE_MAPS[item.id];
      if (!codecFields) continue;

      const normalizedParamNames = new Set((item.params ?? []).map(param => normalize(param.name)));

      for (const field of codecFields) {
        if (PFX_FIELD_EXCEPTIONS.has(field.name)) continue;
        expect(
          normalizedParamNames.has(normalize(field.name)),
          `PFX item "${item.id}" codec field "${field.name}" is missing from its capabilities params`
        ).toBe(true);
      }
    }
  });

  // Delay/reverb group params document only the fields shared across most types at the
  // same byte offset (TIME/FEEDBACK/LEVEL/HIGH CUT; TIME/TONE/DENSITY/PRE-DELAY/LEVEL/DIRECT).
  // Special-effect types (WARP/TWIST/GLITCH for delay) have their own extra fields
  // (modRate, pitch, head, ...) that are deliberately per-type, not promoted to the
  // group level — so unlike fx/pfx, there's no clean reverse (codec -> capabilities)
  // check here without inventing a shared/per-type taxonomy the codec doesn't model.

  it("delay group params match a codec field in some DELAY_TYPE_MAPS entry", () => {
    const allDelayFields = new Set(
      Object.values(DELAY_TYPE_MAPS).flatMap(fields => [...codecFieldNames(fields)])
    );
    const delayGroup = gx1Capabilities.groups.find(group => group.id === "delay");
    const delayParams = delayGroup?.params ?? [];

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
    const reverbGroup = gx1Capabilities.groups.find(group => group.id === "reverb");
    const reverbParams = reverbGroup?.params ?? [];

    for (const param of reverbParams) {
      expect(
        allReverbFields,
        `Reverb group param "${param.name}" has no matching codec field in any REV_TYPE_MAPS entry`
      ).toContain(normalize(param.name));
    }
  });

  // amp/odds/ns/fv are single fixed-shape blocks (no per-type field maps), decoded via
  // hand-written functions rather than a FieldCodec table — so unlike fx/pfx/delay/reverb,
  // there's no exported field-name list to import. Decoding placeholder bytes and reading
  // the resulting object's keys gets the same effect without duplicating a field list here
  // that could silently drift from blocks.ts.
  const decodedFieldNames = (decoded: object, exceptions: Set<string>): Set<string> =>
    new Set(Object.keys(decoded).filter(key => !exceptions.has(key)).map(normalize));

  const groupParamNames = (groupId: string): Set<string> => {
    const group = gx1Capabilities.groups.find(candidate => candidate.id === groupId);
    const params = group?.params ?? [];
    return new Set(params.map(param => normalize(param.name)));
  };

  const assertBidirectionalMatch = (groupId: string, codecNames: Set<string>): void => {
    const paramNames = groupParamNames(groupId);
    for (const name of codecNames) {
      expect(paramNames, `"${groupId}" codec field "${name}" is missing from its capabilities params`).toContain(name);
    }
    for (const name of paramNames) {
      expect(codecNames, `"${groupId}" capabilities param "${name}" has no matching codec field`).toContain(name);
    }
  };

  it("amp group params exactly match decodeAmp's fields (excluding type/speaker/mic, covered by their own groups)", () => {
    const hexList = hexFromBytes(new Array<number>(13).fill(0));
    const decoded = decodeAmp(hexList);

    const codecNames = decodedFieldNames(decoded, new Set(["on", "type", "speaker", "mic"]));

    assertBidirectionalMatch("amp", codecNames);
  });

  it("odds group params exactly match decodeOdDs's fields (excluding on/type, covered elsewhere)", () => {
    const hexList = hexFromBytes(new Array<number>(8).fill(0));
    const decoded = decodeOdDs(hexList);

    const codecNames = decodedFieldNames(decoded, new Set(["on", "type"]));

    assertBidirectionalMatch("odds", codecNames);
  });

  it("ns group params exactly match decodeNs's fields (excluding on)", () => {
    const hexList = hexFromBytes(new Array<number>(4).fill(0));
    const decoded = decodeNs(hexList);

    const codecNames = decodedFieldNames(decoded, new Set(["on"]));

    assertBidirectionalMatch("ns", codecNames);
  });

  it("fv group params exactly match decodeFv's fields", () => {
    const hexList = hexFromBytes(new Array<number>(4).fill(0));
    const decoded = decodeFv(hexList);

    const codecNames = decodedFieldNames(decoded, new Set());

    assertBidirectionalMatch("fv", codecNames);
  });
});
