import { describe, it, expect } from "vitest";
import {
  DEFAULT_CHAIN,
  moveBefore,
  validateChain,
  defaultFxParams,
  basePatch,
  amp,
  odds,
  fx,
  ns,
  fv,
  pfx,
  delay,
  reverb,
} from "../../../src/devices/gx1/builder";
import { decodePatch, encodePatch } from "../../../src/devices/gx1/codec";
import { bytesFromHex } from "../../../src/devices/gx1/codec/primitives";
import { BLOCK_DEFAULTS, DEFAULTS_BY_TYPE, DEFAULT_SUBTYPES } from "../../../src/devices/gx1/defaults";
import { PARAM_SUBTYPE_EFFECTS } from "../../../src/devices/gx1/common";
import { DEFAULT_INIT_FIXTURE, present, patchAt } from "../../helpers";

describe("basePatch", () => {
  it("defaults to DEFAULT_CHAIN and key C", () => {
    const patch = basePatch("Lead");

    expect(patch.name).toBe("Lead");
    expect(patch.chain).toEqual(DEFAULT_CHAIN);
    expect(patch.key).toBe("C");
  });

  it("accepts a custom chain and key", () => {
    const custom = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");

    const patch = basePatch("Test", custom, "G");

    expect(patch.chain).toEqual(custom);
    expect(patch.key).toBe("G");
  });
});

describe("moveBefore", () => {
  it("relocates a node to sit immediately before another, preserving the rest", () => {
    const result = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");
    const odIndex = result.indexOf("OD/DS");
    const fx1Index = result.indexOf("FX1");
    const resultAsSet = new Set(result);
    const defaultChainAsSet = new Set(DEFAULT_CHAIN);

    expect(odIndex).toBe(fx1Index - 1);
    expect(result).toHaveLength(DEFAULT_CHAIN.length);
    expect(resultAsSet).toEqual(defaultChainAsSet);
  });

  it("throws when beforeNode isn't found in the chain", () => {
    const moveMissingNode = () => moveBefore(DEFAULT_CHAIN, "FX2", "NOT-A-NODE");

    expect(moveMissingNode).toThrow();
  });

  // Real device values (a GX-1 was used to perform each reorder, then exported and
  // byte-diffed), so a wrong MEMORY%CHAIN encoding fails this, not just self-consistency.
  it("encodes an FX2-after-AMP reorder to the real device bytes", () => {
    const chain = moveBefore(DEFAULT_CHAIN, "FX2", "NS");
    const patch = basePatch("Test", chain);

    const encoded = encodePatch(patch);
    const chainBytes = bytesFromHex(present(encoded.paramSet["MEMORY%CHAIN"], "the encoded chain block"));

    expect(chainBytes).toEqual([1, 2, 3, 4, 5, 7, 9, 8, 6, 10, 0, 11, 12]);
  });

  it("encodes an OD/DS-before-FX1 reorder to the real device bytes", () => {
    const chain = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");
    const patch = basePatch("Test", chain);

    const encoded = encodePatch(patch);
    const chainBytes = bytesFromHex(present(encoded.paramSet["MEMORY%CHAIN"], "the encoded chain block"));

    expect(chainBytes).toEqual([1, 3, 4, 2, 7, 6, 9, 8, 5, 10, 0, 11, 12]);
  });
});

describe("validateChain", () => {
  it("returns a complete reordered chain as given", () => {
    const reordered = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");

    const result = validateChain(reordered);

    expect(result).toEqual(reordered);
  });

  it("accepts \"OD\" as an alias for \"OD/DS\"", () => {
    const aliased = DEFAULT_CHAIN.map(block => (block === "OD/DS" ? "OD" : block));

    const result = validateChain(aliased);

    expect(result).toEqual(DEFAULT_CHAIN);
  });

  it("names every missing block when the chain is incomplete", () => {
    const validatePartialChain = () => validateChain(["OD/DS", "FX1"]);

    // The blocks left out are the whole fix a caller has to make, so the message has to list them.
    expect(validatePartialChain).toThrow(/PFX/);
    expect(validatePartialChain).toThrow(/REV/);
  });

  it("throws on an unknown block name", () => {
    const validateChainWithBogusBlock = () => validateChain([...DEFAULT_CHAIN, "BOGUS"]);

    expect(validateChainWithBogusBlock).toThrow(/BOGUS/);
  });

  it("throws on a duplicate block name", () => {
    const validateChainWithDuplicateBlock = () => validateChain([...DEFAULT_CHAIN, "FX1"]);

    expect(validateChainWithDuplicateBlock).toThrow(/FX1/);
  });
});

describe("amp", () => {
  it("sets every amp field", () => {
    const patch = basePatch("Test");

    amp(patch, {
      type: "JC-120", gain: 60, bass: 55, middle: 50, treble: 45,
      speaker: '4x12"', mic: "CND87", level: 90, solo: true, soloLevel: 80, on: false,
    });

    expect(patch.amp).toMatchObject({
      on: false, type: "JC-120", gain: 60, bass: 55, middle: 50, treble: 45,
      speaker: '4x12"', mic: "CND87", level: 90, solo: true, soloLevel: 80,
    });
  });

  // Only `type` has to be supplied: choosing the amp model is the point of setting the block, and
  // every knob on it has a factory value the device itself ships.
  it("gives every unset control the device's factory default", () => {
    const patch = basePatch("Test");

    amp(patch, { type: "TWIN" });

    expect(patch.amp).toMatchObject({ on: true, type: "TWIN", ...BLOCK_DEFAULTS.amp });
  });

  it("keeps what the caller does set, defaulting only the rest", () => {
    const patch = basePatch("Test");

    amp(patch, { type: "TWIN", gain: 90, mic: "CND87" });

    expect(patch.amp).toMatchObject({ gain: 90, mic: "CND87", level: present(BLOCK_DEFAULTS.amp, "the amp defaults").level });
  });

  // The block is mutated in place call after call, so a control the second call leaves out has to
  // go back to the factory value rather than keeping what the first call put there.
  it("re-defaults a control the next call leaves out", () => {
    const patch = basePatch("Test");

    amp(patch, { type: "TWIN", gain: 90 });
    amp(patch, { type: "JC-120" });

    expect(patch.amp.gain).toBe(present(BLOCK_DEFAULTS.amp, "the amp defaults").gain);
  });
});

describe("odds", () => {
  it("sets every odds field", () => {
    const patch = basePatch("Test");

    odds(patch, {
      type: "BLUES OD", drive: 70, tone: 60, level: 80, direct: 10, solo: true, soloLevel: 75, on: false,
    });

    expect(patch.odds).toMatchObject({
      on: false, type: "BLUES OD", drive: 70, tone: 60, level: 80, direct: 10, solo: true, soloLevel: 75,
    });
  });

  it("defaults direct, solo and on state", () => {
    const patch = basePatch("Test");

    odds(patch, { type: "OVERDRIVE", drive: 50, tone: 50, level: 50 });

    expect(patch.odds).toMatchObject({ on: true, direct: 0, solo: false, soloLevel: 50 });
  });
});

describe("fx", () => {
  it("sets the slot's fields, filling unset params with the type's defaults", () => {
    const patch = basePatch("Test");

    fx(patch, { slot: "fx1", type: "CHORUS", params: { rate: 50, depth: 60 } });

    expect(patch.fx1.on).toBe(true);
    expect(patch.fx1.type).toBe("CHORUS");
    expect(patch.fx1.params).toMatchObject({ rate: 50, depth: 60, level: 100, preDelay: 4, direct: 100 });
  });

  // A type with sub-models is always set to one, so an omitted subType has to mean the model the
  // device opens on. It used to mean raw byte 0, which for OD/DS is a different pedal entirely.
  it.each([...PARAM_SUBTYPE_EFFECTS].map(type => [type, DEFAULT_SUBTYPES.fx?.[type]]))(
    "opens %s on the device's own sub-model when none is named",
    (type, expected) => {
      const patch = basePatch("Test");

      fx(patch, { slot: "fx1", type });

      expect(patch.fx1.subType).toBe(expected);
      expect(patch.fx1.params.subType).toBe(expected);
    }
  );

  it("configures each slot independently and honors on: false", () => {
    const patch = basePatch("Test");

    fx(patch, { slot: "fx2", type: "FLANGER", params: { rate: 30 } });
    fx(patch, { slot: "fx3", type: "DELAY", subType: "STANDARD", params: { time: 200 }, on: false });

    expect(patch.fx2).toMatchObject({ on: true, type: "FLANGER" });
    expect(patch.fx3).toMatchObject({ on: false, type: "DELAY", subType: "STANDARD" });
  });

  // The sub-algorithm picks the field set, so with none named there was nothing to default from
  // and the block came out with every param at 0. It opens on the factory sub-algorithm instead.
  it("fx DELAY with no sub-algorithm opens on the factory one, at its own defaults", () => {
    const patch = basePatch("Test");

    fx(patch, { slot: "fx1", type: "DELAY" });

    expect(patch.fx1.subType).toBe("STANDARD");
    expect(patch.fx1.params).toMatchObject(present(DEFAULTS_BY_TYPE.fxDelay.STANDARD, "the STANDARD fx-delay defaults"));
  });

  it("fx DELAY with a WARP sub-algorithm defaults that sub-algorithm's own fields", () => {
    const patch = basePatch("Test");

    fx(patch, { slot: "fx1", type: "DELAY", subType: "WARP", params: { level: 80 } });

    // WARP's fields are time/trigger/level; the selection rides along under the same name it
    // carries everywhere else, and is not one of the defaulted params.
    expect(patch.fx1.params).toEqual({ time: 400, trigger: false, level: 80, subType: "WARP" });
  });

  // FIXED WAH's model selector lives in param-block byte p[0] (PARAM_SUBTYPE_EFFECTS),
  // not FX_COM byte[2]. This proves both halves of that threading: fx() writing the selection
  // into the params bag on encode, and decodePatch promoting it back onto the block on decode.
  it("round-trips FIXED WAH's subType through encode/decode", () => {
    const patch = basePatch("Test");
    fx(patch, { slot: "fx1", type: "FIXED WAH", subType: "VO WAH", params: { level: 80, direct: 20, manual: 60 } });

    const decoded = decodePatch(encodePatch(patch));

    expect(decoded.fx1.subType).toBe("VO WAH");
    expect(decoded.fx1.params).toMatchObject({ level: 80, direct: 20, manual: 60 });
  });

  // The FX-slot REVERB's algorithm selector also lives in param-block byte p[0]
  // (PARAM_SUBTYPE_EFFECTS), the shared-param-set case, like CHORUS.
  it("round-trips the FX-slot REVERB's subType through encode/decode", () => {
    const patch = basePatch("Test");
    fx(patch, { slot: "fx1", type: "REVERB", subType: "HALL M", params: { time: 2.5, level: 40 } });

    const decoded = decodePatch(encodePatch(patch));

    expect(decoded.fx1.subType).toBe("HALL M");
    expect(decoded.fx1.params).toMatchObject({ time: 2.5, level: 40 });
  });

  // PHASER's variant is its `stage` param, not a subType, so a subType sent here encodes nowhere.
  // Accepting and dropping it is what let a patch save clean and play at the wrong stage count.
  it("throws when given a subType for an effect whose variant is an ordinary param", () => {
    const patch = basePatch("Test");
    const setSubType = () => { fx(patch, { slot: "fx1", type: "PHASER", subType: "4 STAGE" }); };

    expect(setSubType).toThrow(/stage/);
  });

  it("throws when a sub-model is set both as subType and in the params bag", () => {
    const patch = basePatch("Test");
    const setBothWays = () => {
      fx(patch, { slot: "fx1", type: "COMPRESSOR", subType: "D-COMP", params: { type: "ORANGE" } });
    };

    expect(setBothWays).toThrow();
  });

  // OVERTONE (FX3-only) stores its params in the separate MEMORY%FX3A block instead
  // of the shared 251-byte FX param block, so this proves both halves of that
  // special-casing in codec/patch.ts round-trip correctly.
  it("round-trips OVERTONE on fx3 through its dedicated MEMORY%FX3A block", () => {
    const patch = basePatch("Test");
    fx(patch, { slot: "fx3", type: "OVERTONE", params: { lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 } });

    const decoded = decodePatch(encodePatch(patch));

    expect(decoded.fx3.type).toBe("OVERTONE");
    expect(decoded.fx3.params).toMatchObject({ lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 });
  });

  it("rejects OVERTONE in a slot with no MEMORY%FX3A block to write it to", () => {
    const patch = basePatch("Test");
    const setOvertoneOnFx1 = () => { fx(patch, { slot: "fx1", type: "OVERTONE" }); };

    expect(setOvertoneOnFx1).toThrow(/fx3/);
  });

  it("accepts an unrecognized FX type with no params, without throwing", () => {
    const patch = basePatch("Test");
    const setBogusType = () => { fx(patch, { slot: "fx1", type: "BOGUS TYPE" }); };

    expect(setBogusType).not.toThrow();
    expect(patch.fx1.type).toBe("BOGUS TYPE");
    expect(patch.fx1.params).toEqual({});
  });

  it("throws when a param key isn't valid for the FX type (ROTARY's field is \"speed\", not \"speedSelect\")", () => {
    const patch = basePatch("Test");
    const setInvalidParam = () => { fx(patch, { slot: "fx1", type: "ROTARY", params: { speedSelect: "FAST" } }); };

    expect(setInvalidParam).toThrow();
  });

  it("defaults unset GEQ bands to 0 dB instead of the signed-center raw byte", () => {
    const patch = basePatch("Test");

    fx(patch, { slot: "fx1", type: "HIGH GEQ", params: { level: 80, "4kHz": 5 } });

    expect(patch.fx1.params).toEqual({
      "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 5, "8kHz": 0, level: 80,
    });
  });
});

describe("ns", () => {
  it("sets the fields, enabling the block and detecting at INPUT by default", () => {
    const patch = basePatch("Test");

    ns(patch, { threshold: 40, release: 30 });

    expect(patch.ns).toMatchObject({ on: true, threshold: 40, release: 30, detect: "INPUT" });
  });

  it("honors an explicit detect mode and on: false", () => {
    const patch = basePatch("Test");

    ns(patch, { threshold: 40, release: 30, on: false, detect: "NS INPUT" });

    expect(patch.ns).toMatchObject({ on: false, detect: "NS INPUT" });
  });
});

describe("fv", () => {
  it("sets every fv field", () => {
    const patch = basePatch("Test");

    fv(patch, { position: 80, min: 10, max: 90, curve: "FAST" });

    expect(patch.fv).toMatchObject({ position: 80, min: 10, max: 90, curve: "FAST" });
  });

  it("defaults curve to NORMAL", () => {
    const patch = basePatch("Test");

    fv(patch, { position: 100, min: 0, max: 100 });

    expect(patch.fv.curve).toBe("NORMAL");
  });
});

describe("pfx", () => {
  it("sets WAH fields and enables the block by default", () => {
    const patch = basePatch("Test");
    const wahParams = { subType: "VO WAH", level: 80, direct: 20, position: 90, min: 10, max: 100 };

    pfx(patch, { type: "WAH", params: wahParams });

    expect(patch.pfx).toMatchObject({ on: true, type: "WAH", ...wahParams });
  });

  it("fills every WAH field with real factory defaults when no params are passed", () => {
    const patch = basePatch("Test");

    pfx(patch, { type: "WAH", params: { level: 90 } });

    expect(patch.pfx).toMatchObject({
      subType: "CRY WAH", level: 90, direct: 0, position: 100, min: 0, max: 100,
    });
  });

  it("fills PEDAL BEND fields, including the signed pitchMin/pitchMax, with real factory defaults", () => {
    const patch = basePatch("Test");

    pfx(patch, { type: "PEDAL BEND" });

    expect(patch.pfx).toMatchObject({
      pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0,
    });
  });

  it("selects the wah model from subType", () => {
    const patch = basePatch("Test");

    pfx(patch, { type: "WAH", subType: "VO WAH", params: { level: 80 } });

    expect(patch.pfx).toMatchObject({ type: "WAH", subType: "VO WAH", level: 80 });
  });

  it("throws when given a subType for a type with no sub-models", () => {
    const patch = basePatch("Test");
    const setSubType = () => { pfx(patch, { type: "PEDAL BEND", subType: "CRY WAH" }); };

    expect(setSubType).toThrow(/pitchMin/);
  });

  it("throws when the wah model is set both as subType and in the params bag", () => {
    const patch = basePatch("Test");
    const setBothWays = () => { pfx(patch, { type: "WAH", subType: "VO WAH", params: { subType: "CRY WAH" } }); };

    expect(setBothWays).toThrow();
  });

  it("throws when a param isn't valid for the pfx type", () => {
    const patch = basePatch("Test");
    const setInvalidParam = () => { pfx(patch, { type: "WAH", params: { pitchMin: -12 } }); };

    expect(setInvalidParam).toThrow();
  });

  it("can bypass the block", () => {
    const patch = basePatch("Test");

    pfx(patch, { type: "WAH", on: false });

    expect(patch.pfx.on).toBe(false);
  });

  it("accepts an unrecognized type with no params, without throwing", () => {
    const patch = basePatch("Test");
    const setBogusType = () => { pfx(patch, { type: "BOGUS TYPE" }); };

    expect(setBogusType).not.toThrow();
    expect(patch.pfx.type).toBe("BOGUS TYPE");
  });
});

describe("delay", () => {
  it("sets every named delay field, storing the high cut label verbatim", () => {
    const patch = basePatch("Test");

    delay(patch, { type: "ANALOG", time: 1, feedback: 40, level: 50, highCut: "2kHz", on: false });

    expect(patch.delay).toMatchObject({
      on: false, type: "ANALOG", time: 1, feedback: 40, level: 50, highCut: "2kHz",
    });
  });

  it("enables the block and takes the type's factory high cut by default", () => {
    const patch = basePatch("Test");

    delay(patch, { type: "STANDARD", time: 7, feedback: 50, level: 60 });

    expect(patch.delay).toMatchObject({ on: true, highCut: "6.3kHz" });
  });

  it("throws on encode for an unrecognized high cut label", () => {
    const patch = basePatch("Test");
    delay(patch, { type: "PAN", time: 1, feedback: 30, level: 40, highCut: "UNKNOWN" });

    const encodeWithBadHighCut = () => { encodePatch(patch); };

    expect(encodeWithBadHighCut).toThrow();
  });

  it("merges type-specific params-bag entries", () => {
    const patch = basePatch("Test");

    delay(patch, { type: "MODULATE", time: 1, feedback: 50, level: 50, params: { modRate: 5 } });

    expect(patch.delay).toMatchObject({ modRate: 5 });
  });

  it("throws when a params-bag key isn't valid for the delay type", () => {
    const patch = basePatch("Test");
    const setInvalidExtra = () => {
      delay(patch, { type: "STANDARD", time: 7, feedback: 50, level: 60, params: { modRate: 5 } });
    };

    expect(setInvalidExtra).toThrow();
  });

  it("rejects a control set both as a named option and in the params bag", () => {
    const patch = basePatch("Test");
    const setTwice = () => {
      delay(patch, { type: "STANDARD", time: 7, feedback: 50, level: 60, params: { feedback: 80 } });
    };

    expect(setTwice).toThrow(/feedback/);
  });

  // The named controls are not universal: requiring them made a caller invent values for a type
  // that has no such field, which encode then dropped without a word.
  it("rejects a named control the chosen type has no field for, naming what it does take", () => {
    const patch = basePatch("Test");
    const setAbsentControl = () => {
      delay(patch, { type: "TWIST", time: 400, level: 50 });
    };

    expect(setAbsentControl).toThrow(/time/);
    expect(setAbsentControl).toThrow(/riseTime/);
  });

  it("builds a type that has none of the usual controls, from its own params alone", () => {
    const patch = basePatch("Test");

    delay(patch, { type: "GLITCH", time: 0, params: { glitch: 60, balance: 40 } });

    expect(patch.delay).toMatchObject({ on: true, type: "GLITCH", time: 0, glitch: 60, balance: 40, trigger: false });
  });

  it("fills type-specific fields no named option covers with real factory defaults", () => {
    const patch = basePatch("Test");

    delay(patch, { type: "SHIMMER", time: 1, feedback: 40, level: 50 });

    expect(patch.delay).toMatchObject({ pitch: 12, balance: 50 });
  });

  it("fills WARP's trigger field, which no named option covers at all", () => {
    const patch = basePatch("Test");

    delay(patch, { type: "WARP", time: 1, level: 50 });

    expect(patch.delay).toMatchObject({ trigger: false, level: 50 });
  });
});

describe("reverb", () => {
  it("sets every named reverb field", () => {
    const patch = basePatch("Test");

    reverb(patch, {
      type: "HALL M", time: 2.5, level: 80, preDelay: 10, tone: 5, density: 7, direct: 90, on: false,
    });

    expect(patch.reverb).toMatchObject({
      on: false, type: "HALL M", time: 2.5, level: 80, preDelay: 10, tone: 5, density: 7, direct: 90,
    });
  });

  // Unset controls take the type's factory value, the same rule the params bag follows. PRE-DELAY
  // is the one that shows it: the builder used to hardcode 0, which is not what the device ships.
  it("defaults the unset named controls to the type's factory values", () => {
    const patch = basePatch("Test");

    reverb(patch, { type: "ROOM S", time: 1.0, level: 70 });

    expect(patch.reverb).toMatchObject({ on: true, preDelay: 30, tone: 0, density: 5, direct: 100 });
  });

  // Asserted through the codec because the builder mutates the block in place: a property left by
  // whichever type occupied it before survives in memory, and encode is what settles which fields
  // this type really has.
  it("builds TERA ECHO, which has no TIME, from its own params", () => {
    const patch = basePatch("Test");

    reverb(patch, { type: "TERA ECHO", level: 60, params: { spreadTime: 50, feedback: 40 } });
    const stored = decodePatch(encodePatch(patch));

    expect(stored.reverb).toMatchObject({ type: "TERA ECHO", level: 60, spreadTime: 50, feedback: 40 });
    expect(stored.reverb).not.toHaveProperty("time");
  });

  it("merges type-specific params-bag entries", () => {
    const patch = basePatch("Test");

    reverb(patch, { type: "SHIMMER", time: 3.0, level: 60, params: { pitch: 12 } });

    expect(patch.reverb).toMatchObject({ pitch: 12 });
  });

  it("throws when a params-bag key isn't valid for the reverb type", () => {
    const patch = basePatch("Test");
    const setInvalidExtra = () => {
      reverb(patch, { type: "PLATE", time: 1.5, level: 50, params: { pitch: 12 } });
    };

    expect(setInvalidExtra).toThrow();
  });

  it("fills SUB DELAY's own feedback/highCut fields with real factory defaults", () => {
    const patch = basePatch("Test");

    reverb(patch, { type: "SUB DELAY", time: 1, level: 60 });

    expect(patch.reverb).toMatchObject({ feedback: 30, highCut: "6.3kHz" });
  });

  it("fills SHIMMER's pitch/pitchLevel fields with real factory defaults", () => {
    const patch = basePatch("Test");

    reverb(patch, { type: "SHIMMER", time: 1, level: 60 });

    expect(patch.reverb).toMatchObject({ pitch: 12, pitchLevel: 100 });
  });
});

// Anchors defaultFxParams to the one real captured factory-default source we have:
// core/tests/fixtures/gx1/default-init.tsl. For each FX type actually present there,
// defaultFxParams(type) must match what the real device shows for that type's params.
// Had defaultFxParams existed and drifted from reality, this is what would have caught
// the class of bug where an unset GEQ band decoded to -20 dB instead of 0 dB.
describe("defaultFxParams (anchored to default-init.tsl)", () => {
  const patch = patchAt(DEFAULT_INIT_FIXTURE);

  it("matches the fixture's real COMPRESSOR params (fx1)", () => {
    const compressorDefaults = defaultFxParams("COMPRESSOR");

    expect(patch.fx1.type).toBe("COMPRESSOR");
    expect(compressorDefaults).toEqual({ sustain: 50, attack: 50, level: 60 });
    expect(patch.fx1.params).toMatchObject(compressorDefaults);
  });

  it("matches the fixture's real PARA. EQ params (fx2)", () => {
    const paraEqDefaults = defaultFxParams("PARA. EQ");

    expect(patch.fx2.type).toBe("PARA. EQ");
    expect(paraEqDefaults).toEqual({
      lowGain: 0, highGain: 0, level: 0, midFreq: "4kHz", midGain: 0, lowCut: "FLAT", highCut: "FLAT",
    });
    expect(patch.fx2.params).toEqual(paraEqDefaults);
  });

  it("matches the fixture's real CHORUS params (fx3)", () => {
    const chorusDefaults = defaultFxParams("CHORUS");

    expect(patch.fx3.type).toBe("CHORUS");
    expect(chorusDefaults).toEqual({
      rate: 50, depth: 40, level: 100, preDelay: 4, direct: 100,
    });
    expect(patch.fx3.params).toMatchObject(chorusDefaults);
  });
});
