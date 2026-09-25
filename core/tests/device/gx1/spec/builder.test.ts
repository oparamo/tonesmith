import { describe, it, expect } from "vitest";
import {
  defaultFxParams,
  basePatch,
  block,
} from "../../../../src/device/gx1/spec/builder";
import { decodePatch, encodePatch, validateChain } from "../../../../src/device/gx1/format/codec";
import { bytesFromHex } from "../../../../src/device/gx1/format/codec/primitives";
import { BLOCK_DEFAULTS, DEFAULTS_BY_TYPE, DEFAULT_SUBTYPES } from "../../../../src/device/gx1/catalog/defaults";
import { PARAM_SUBTYPE_EFFECTS, DEFAULT_CHAIN } from "../../../../src/device/gx1/model";
import { DEFAULT_INIT_FIXTURE, moveBefore, patchAt } from "../helpers";
import { present } from "../../../helpers";

const defaultInitPatch = await patchAt(DEFAULT_INIT_FIXTURE);

describe("basePatch", () => {
  it("opens at the default chain and the device's own factory settings", () => {
    const patch = basePatch("Lead");

    expect(patch.name).toBe("Lead");
    expect(patch.chain).toStrictEqual(DEFAULT_CHAIN);
    expect(patch.memoryLevel).toBe(100);
    expect(patch.bpm).toBe(120);
    expect(patch.key).toBe("C");
    expect(patch.carryover).toBe(true);
    expect(patch.tempoHold).toBe(false);
  });

  it("accepts a custom chain and any patch setting", () => {
    const custom = moveBefore(DEFAULT_CHAIN, "drive", "fx1");

    const patch = basePatch("Test", { chain: custom, key: "G", bpm: 90 });

    expect(patch.chain).toStrictEqual(custom);
    expect(patch.key).toBe("G");
    expect(patch.bpm).toBe(90);
  });

  // The two switches ship on and off respectively, so a truthiness test for "did the caller say"
  // would silently restore the factory value for whichever one they deliberately turned off.
  it("keeps a setting the caller set to false", () => {
    const patch = basePatch("Test", { carryover: false });

    expect(patch.carryover).toBe(false);
  });

  it("leaves the settings the caller did not name at their factory values", () => {
    const patch = basePatch("Test", { bpm: 90 });

    expect(patch.memoryLevel).toBe(100);
    expect(patch.key).toBe("C");
  });
});

describe("a reordered chain", () => {
  // Real device values (each reorder was made on a GX-1, exported and byte-diffed), so a wrong
  // MEMORY%CHAIN encoding fails this, not just self-consistency.
  it("encodes an fx2-after-noiseGate reorder to the real device bytes", () => {
    const chain = moveBefore(DEFAULT_CHAIN, "fx2", "noiseGate");
    const patch = basePatch("Test", { chain });

    const encoded = encodePatch(patch);
    const chainBytes = bytesFromHex(present(encoded.paramSet["MEMORY%CHAIN"], "the encoded chain block"));

    expect(chainBytes).toStrictEqual([1, 2, 3, 4, 5, 7, 9, 8, 6, 10, 0, 11, 12]);
  });

  it("encodes a drive-before-fx1 reorder to the real device bytes", () => {
    const chain = moveBefore(DEFAULT_CHAIN, "drive", "fx1");
    const patch = basePatch("Test", { chain });

    const encoded = encodePatch(patch);
    const chainBytes = bytesFromHex(present(encoded.paramSet["MEMORY%CHAIN"], "the encoded chain block"));

    expect(chainBytes).toStrictEqual([1, 3, 4, 2, 7, 6, 9, 8, 5, 10, 0, 11, 12]);
  });
});

describe("validateChain", () => {
  it("returns a complete reordered chain as given", () => {
    const reordered = moveBefore(DEFAULT_CHAIN, "drive", "fx1");

    const accepted = () => { validateChain(reordered); };

    expect(accepted).not.toThrow();
  });

  it("names every missing block when the chain is incomplete", () => {
    const validatePartialChain = () => { validateChain(["drive", "fx1"]); };

    // The blocks left out are the whole fix a caller has to make, so the message has to list them.
    expect(validatePartialChain).toThrow(/pedalFx/);
    expect(validatePartialChain).toThrow(/reverb/);
  });

  it("throws on an unknown block name", () => {
    const validateChainWithBogusBlock = () => { validateChain([...DEFAULT_CHAIN, "BOGUS"]); };

    expect(validateChainWithBogusBlock).toThrow(/BOGUS/);
  });

  it("throws on a duplicate block name", () => {
    const validateChainWithDuplicateBlock = () => { validateChain([...DEFAULT_CHAIN, "fx1"]); };

    expect(validateChainWithDuplicateBlock).toThrow(/fx1/);
  });
});

describe("amp", () => {
  it("sets every amp field", () => {
    const patch = basePatch("Test");

    block(patch, "amp", {
      type: "JC-120",
      on: false,
      params: {
        gain: 60, bass: 55, middle: 50, treble: 45,
        speaker: '4x12"', mic: "CND87", level: 90, solo: true, soloLevel: 80,
      },
    });

    expect(patch.amp).toMatchObject({ on: false, type: "JC-120" });
    expect(patch.amp.params).toStrictEqual({
      gain: 60, bass: 55, middle: 50, treble: 45,
      speaker: '4x12"', mic: "CND87", level: 90, solo: true, soloLevel: 80,
    });
  });

  // Only `type` has to be supplied: choosing the amp model is the point of setting the block, and
  // every knob on it has a factory value the device itself ships.
  it("gives every unset control the device's factory default", () => {
    const patch = basePatch("Test");

    block(patch, "amp", { type: "TWIN" });

    expect(patch.amp).toMatchObject({ on: true, type: "TWIN" });
    expect(patch.amp.params).toStrictEqual(BLOCK_DEFAULTS.amp);
  });

  it("keeps what the caller does set, defaulting only the rest", () => {
    const patch = basePatch("Test");

    block(patch, "amp", { type: "TWIN", params: { gain: 90, mic: "CND87" } });

    expect(patch.amp.params).toMatchObject({ gain: 90, mic: "CND87", level: present(BLOCK_DEFAULTS.amp, "the amp defaults").level });
  });

  // The block is mutated in place call after call, so a control the second call leaves out has to
  // go back to the factory value rather than keeping what the first call put there.
  it("re-defaults a control the next call leaves out", () => {
    const patch = basePatch("Test");

    block(patch, "amp", { type: "TWIN", params: { gain: 90 } });
    block(patch, "amp", { type: "JC-120" });

    expect(patch.amp.params.gain).toBe(present(BLOCK_DEFAULTS.amp, "the amp defaults").gain);
  });
});

describe("drive", () => {
  it("sets every drive field", () => {
    const patch = basePatch("Test");

    block(patch, "drive", {
      type: "BLUES OD",
      on: false,
      params: { drive: 70, tone: 60, level: 80, direct: 10, solo: true, soloLevel: 75 },
    });

    expect(patch.drive).toMatchObject({ on: false, type: "BLUES OD" });
    expect(patch.drive.params).toStrictEqual({
      drive: 70, tone: 60, level: 80, direct: 10, solo: true, soloLevel: 75,
    });
  });

  it("defaults direct, solo and on state", () => {
    const patch = basePatch("Test");

    block(patch, "drive", { type: "OVERDRIVE", params: { drive: 50, tone: 50, level: 50 } });

    expect(patch.drive.on).toBe(true);
    expect(patch.drive.params).toMatchObject({ direct: 0, solo: false, soloLevel: 50 });
  });
});

describe("fx", () => {
  it("sets the slot's fields, filling unset params with the type's defaults", () => {
    const patch = basePatch("Test");

    block(patch, "fx1", { type: "CHORUS", params: { rate: 50, depth: 60 } });

    expect(patch.fx1.on).toBe(true);
    expect(patch.fx1.type).toBe("CHORUS");
    expect(patch.fx1.params).toMatchObject({ rate: 50, depth: 60, level: 100, preDelay: 4, direct: 100 });
  });

  // Read through `present` rather than `?.`: an effect dropping out of the defaults would otherwise
  // make the assertion `expect(undefined).toBe(undefined)` and pass on the regression it guards.
  const fxSubModelDefaults = present(DEFAULT_SUBTYPES.fx, "the fx block's default sub-models");

  // A type with sub-models is always set to one, so an omitted subType has to mean the model the
  // device opens on, not raw byte 0, which for OD/DS is a different pedal entirely.
  it.each([...PARAM_SUBTYPE_EFFECTS].map(
    type => [type, present(fxSubModelDefaults[type], `a default sub-model for fx ${type}`)]
  ))(
    "opens %s on the device's own sub-model when none is named",
    (type, expected) => {
      const patch = basePatch("Test");

      block(patch, "fx1", { type });

      expect(patch.fx1.subType).toBe(expected);
      expect(patch.fx1.params, "the selection is carried once, on the block").not.toHaveProperty("subType");
    }
  );

  it("configures each slot independently and honors on: false", () => {
    const patch = basePatch("Test");

    block(patch, "fx2", { type: "FLANGER", params: { rate: 30 } });
    block(patch, "fx3", { type: "DELAY", subType: "STANDARD", params: { time: 200 }, on: false });

    expect(patch.fx2).toMatchObject({ on: true, type: "FLANGER" });
    expect(patch.fx3).toMatchObject({ on: false, type: "DELAY", subType: "STANDARD" });
  });

  // The sub-algorithm picks the field set, so with none named there would be nothing to default
  // from and every param would come out at 0. Opening on the factory sub-algorithm avoids that.
  it("fx DELAY with no sub-algorithm opens on the factory one, at its own defaults", () => {
    const patch = basePatch("Test");

    block(patch, "fx1", { type: "DELAY" });

    expect(patch.fx1.subType).toBe("STANDARD");
    expect(patch.fx1.params).toMatchObject(present(DEFAULTS_BY_TYPE.fxDelay.STANDARD, "the STANDARD fx-delay defaults"));
  });

  it("fx DELAY with a WARP sub-algorithm defaults that sub-algorithm's own fields", () => {
    const patch = basePatch("Test");

    block(patch, "fx1", { type: "DELAY", subType: "WARP", params: { level: 80 } });

    // WARP's fields are time/trigger/level. The sub-algorithm picks that field set but is not one
    // of them: it lives on the block, not among the params it selects.
    expect(patch.fx1.params).toStrictEqual({ time: 400, trigger: false, level: 80 });
  });

  // FIXED WAH's model selector lives in param-block byte p[0] (PARAM_SUBTYPE_EFFECTS), not FX_COM
  // byte[2]. This proves both halves of that threading: encodePatch putting the block's selection
  // back into byte p[0], and decodePatch lifting it off the params it read.
  it("round-trips FIXED WAH's subType through encode/decode", () => {
    const patch = basePatch("Test");
    block(patch, "fx1", { type: "FIXED WAH", subType: "VO WAH", params: { level: 80, direct: 20, manual: 60 } });

    const decoded = decodePatch(encodePatch(patch));

    expect(decoded.fx1.subType).toBe("VO WAH");
    expect(decoded.fx1.params).toMatchObject({ level: 80, direct: 20, manual: 60 });
  });

  // The FX-slot REVERB's algorithm selector also lives in param-block byte p[0]
  // (PARAM_SUBTYPE_EFFECTS), the shared-param-set case, like CHORUS.
  it("round-trips the FX-slot REVERB's subType through encode/decode", () => {
    const patch = basePatch("Test");
    block(patch, "fx1", { type: "REVERB", subType: "HALL M", params: { time: 2.5, level: 40 } });

    const decoded = decodePatch(encodePatch(patch));

    expect(decoded.fx1.subType).toBe("HALL M");
    expect(decoded.fx1.params).toMatchObject({ time: 2.5, level: 40 });
  });

  // OVERTONE (FX3-only) stores its params in the separate MEMORY%FX3A block instead
  // of the shared 251-byte FX param block, so this proves both halves of that
  // special-casing in codec/patch.ts round-trip correctly.
  it("round-trips OVERTONE on fx3 through its dedicated MEMORY%FX3A block", () => {
    const patch = basePatch("Test");
    block(patch, "fx3", { type: "OVERTONE", params: { lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 } });

    const decoded = decodePatch(encodePatch(patch));

    expect(decoded.fx3.type).toBe("OVERTONE");
    expect(decoded.fx3.params).toMatchObject({ lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 });
  });

  it("accepts an unrecognized FX type with no params, without throwing", () => {
    const patch = basePatch("Test");
    const setBogusType = () => { block(patch, "fx1", { type: "BOGUS TYPE" }); };

    expect(setBogusType).not.toThrow();
    expect(patch.fx1.type).toBe("BOGUS TYPE");
    expect(patch.fx1.params).toStrictEqual({});
  });

  it("defaults unset GEQ bands to 0 dB instead of the signed-center raw byte", () => {
    const patch = basePatch("Test");

    block(patch, "fx1", { type: "HIGH GEQ", params: { level: 80, "4kHz": 5 } });

    expect(patch.fx1.params).toStrictEqual({
      "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 5, "8kHz": 0, level: 80,
    });
  });
});

describe("noiseGate", () => {
  it("sets the params, enabling the block and detecting at INPUT by default", () => {
    const patch = basePatch("Test");

    block(patch, "noiseGate", { params: { threshold: 40, release: 30 } });

    expect(patch.noiseGate.on).toBe(true);
    expect(patch.noiseGate.params).toStrictEqual({ threshold: 40, release: 30, detect: "INPUT" });
  });

  it("honors an explicit detect mode and on: false", () => {
    const patch = basePatch("Test");

    block(patch, "noiseGate", { on: false, params: { threshold: 40, release: 30, detect: "NS INPUT" } });

    expect(patch.noiseGate.on).toBe(false);
    expect(patch.noiseGate.params.detect).toBe("NS INPUT");
  });
});

describe("volume", () => {
  it("sets every volume param", () => {
    const patch = basePatch("Test");

    block(patch, "volume", { params: { position: 80, min: 10, max: 90, curve: "FAST" } });

    expect(patch.volume.params).toStrictEqual({ position: 80, min: 10, max: 90, curve: "FAST" });
  });

  it("defaults curve to NORMAL", () => {
    const patch = basePatch("Test");

    block(patch, "volume", { params: { position: 100, min: 0, max: 100 } });

    expect(patch.volume.params.curve).toBe("NORMAL");
  });
});

describe("pedalFx", () => {
  it("sets WAH params and enables the block by default", () => {
    const patch = basePatch("Test");
    const wahParams = { level: 80, direct: 20, position: 90, min: 10, max: 100 };

    block(patch, "pedalFx", { type: "WAH", subType: "VO WAH", params: wahParams });

    expect(patch.pedalFx).toMatchObject({ on: true, type: "WAH", subType: "VO WAH" });
    expect(patch.pedalFx.params).toStrictEqual(wahParams);
  });

  it("fills every WAH param with real factory defaults when no params are passed", () => {
    const patch = basePatch("Test");

    block(patch, "pedalFx", { type: "WAH", params: { level: 90 } });

    expect(patch.pedalFx.subType).toBe("CRY WAH");
    expect(patch.pedalFx.params).toStrictEqual({ level: 90, direct: 0, position: 100, min: 0, max: 100 });
  });

  it("fills PEDAL BEND params, including the signed pitchMin/pitchMax, with real factory defaults", () => {
    const patch = basePatch("Test");

    block(patch, "pedalFx", { type: "PEDAL BEND" });

    expect(patch.pedalFx.params).toStrictEqual({
      pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0,
    });
  });

  it("selects the wah model from subType", () => {
    const patch = basePatch("Test");

    block(patch, "pedalFx", { type: "WAH", subType: "VO WAH", params: { level: 80 } });

    expect(patch.pedalFx).toMatchObject({ type: "WAH", subType: "VO WAH" });
    expect(patch.pedalFx.params.level).toBe(80);
  });

  it("can bypass the block", () => {
    const patch = basePatch("Test");

    block(patch, "pedalFx", { type: "WAH", on: false });

    expect(patch.pedalFx.on).toBe(false);
  });

  it("accepts an unrecognized type with no params, without throwing", () => {
    const patch = basePatch("Test");
    const setBogusType = () => { block(patch, "pedalFx", { type: "BOGUS TYPE" }); };

    expect(setBogusType).not.toThrow();
    expect(patch.pedalFx.type).toBe("BOGUS TYPE");
  });
});

describe("delay", () => {
  it("sets every delay param, storing the high cut label verbatim", () => {
    const patch = basePatch("Test");

    block(patch, "delay", { type: "ANALOG", on: false, params: { time: 1, feedback: 40, level: 50, highCut: "2kHz" } });

    expect(patch.delay).toMatchObject({ on: false, type: "ANALOG" });
    expect(patch.delay.params).toMatchObject({ time: 1, feedback: 40, level: 50, highCut: "2kHz" });
  });

  it("enables the block and takes the type's factory high cut by default", () => {
    const patch = basePatch("Test");

    block(patch, "delay", { type: "STANDARD", params: { time: 7, feedback: 50, level: 60 } });

    expect(patch.delay.on).toBe(true);
    expect(patch.delay.params.highCut).toBe("6.3kHz");
  });

  it("throws on encode for an unrecognized high cut label", () => {
    const patch = basePatch("Test");
    block(patch, "delay", { type: "PAN", params: { time: 1, feedback: 30, level: 40, highCut: "UNKNOWN" } });

    const encodeWithBadHighCut = () => { encodePatch(patch); };

    expect(encodeWithBadHighCut).toThrow();
  });

  it("merges type-specific params", () => {
    const patch = basePatch("Test");

    block(patch, "delay", { type: "MODULATE", params: { time: 1, feedback: 50, level: 50, modRate: 5 } });

    expect(patch.delay.params.modRate).toBe(5);
  });

  it("builds a type that has none of the usual controls, from its own params alone", () => {
    const patch = basePatch("Test");

    block(patch, "delay", { type: "GLITCH", params: { time: 0, glitch: 60, balance: 40 } });

    expect(patch.delay).toMatchObject({ on: true, type: "GLITCH" });
    expect(patch.delay.params).toMatchObject({ time: 0, glitch: 60, balance: 40, trigger: false });
  });

  it("fills type-specific fields the caller leaves unset with real factory defaults", () => {
    const patch = basePatch("Test");

    block(patch, "delay", { type: "SHIMMER", params: { time: 1, feedback: 40, level: 50 } });

    expect(patch.delay.params).toMatchObject({ pitch: 12, balance: 50 });
  });

  it("fills WARP's trigger field, which the caller rarely names", () => {
    const patch = basePatch("Test");

    block(patch, "delay", { type: "WARP", params: { time: 1, level: 50 } });

    expect(patch.delay.params).toMatchObject({ trigger: false, level: 50 });
  });
});

describe("reverb", () => {
  it("sets every reverb param", () => {
    const patch = basePatch("Test");

    block(patch, "reverb", {
      type: "HALL M",
      on: false,
      params: { time: 2.5, level: 80, preDelay: 10, tone: 5, density: 7, direct: 90 },
    });

    expect(patch.reverb).toMatchObject({ on: false, type: "HALL M" });
    expect(patch.reverb.params).toStrictEqual({
      time: 2.5, level: 80, preDelay: 10, tone: 5, density: 7, direct: 90,
    });
  });

  // Unset controls take the type's factory value. PRE-DELAY is the one that shows it: hardcoding 0
  // would not match what the device ships.
  it("defaults the unset controls to the type's factory values", () => {
    const patch = basePatch("Test");

    block(patch, "reverb", { type: "ROOM S", params: { time: 1.0, level: 70 } });

    expect(patch.reverb.on).toBe(true);
    expect(patch.reverb.params).toMatchObject({ preDelay: 30, tone: 0, density: 5, direct: 100 });
  });

  // Asserted through the codec because the builder mutates the block in place: a property left by
  // whichever type occupied it before survives in memory, and encode is what settles which fields
  // this type really has.
  it("builds TERA ECHO, which has no TIME, from its own params", () => {
    const patch = basePatch("Test");

    block(patch, "reverb", { type: "TERA ECHO", params: { level: 60, spreadTime: 50, feedback: 40 } });
    const stored = decodePatch(encodePatch(patch));

    expect(stored.reverb.type).toBe("TERA ECHO");
    expect(stored.reverb.params).toMatchObject({ level: 60, spreadTime: 50, feedback: 40 });
    expect(stored.reverb.params).not.toHaveProperty("time");
  });

  it("merges type-specific params", () => {
    const patch = basePatch("Test");

    block(patch, "reverb", { type: "SHIMMER", params: { time: 3.0, level: 60, pitch: 12 } });

    expect(patch.reverb.params.pitch).toBe(12);
  });

  it("fills SUB DELAY's own feedback/highCut fields with real factory defaults", () => {
    const patch = basePatch("Test");

    block(patch, "reverb", { type: "SUB DELAY", params: { time: 1, level: 60 } });

    expect(patch.reverb.params).toMatchObject({ feedback: 30, highCut: "6.3kHz" });
  });

  it("fills SHIMMER's pitch/pitchLevel fields with real factory defaults", () => {
    const patch = basePatch("Test");

    block(patch, "reverb", { type: "SHIMMER", params: { time: 1, level: 60 } });

    expect(patch.reverb.params).toMatchObject({ pitch: 12, pitchLevel: 100 });
  });
});

// Anchors defaultFxParams to the one real captured factory-default source we have:
// core/tests/fixtures/gx1/default-init.tsl. For each FX type actually present there,
// defaultFxParams(type) must match what the real device shows for that type's params. A drift
// between the two is what puts a wrong value under an unset param, such as a GEQ band decoding
// to -20 dB where the device ships it at 0.
describe("defaultFxParams (anchored to default-init.tsl)", () => {
  const patch = defaultInitPatch;

  it("matches the fixture's real COMPRESSOR params (fx1)", () => {
    const compressorDefaults = defaultFxParams("COMPRESSOR");

    expect(patch.fx1.type).toBe("COMPRESSOR");
    expect(compressorDefaults).toStrictEqual({ sustain: 50, attack: 50, level: 60 });
    expect(patch.fx1.params).toMatchObject(compressorDefaults);
  });

  it("matches the fixture's real PARA. EQ params (fx2)", () => {
    const paraEqDefaults = defaultFxParams("PARA. EQ");

    expect(patch.fx2.type).toBe("PARA. EQ");
    expect(paraEqDefaults).toStrictEqual({
      lowGain: 0, highGain: 0, level: 0, midFreq: "4kHz", midGain: 0, lowCut: "FLAT", highCut: "FLAT",
    });
    expect(patch.fx2.params).toStrictEqual(paraEqDefaults);
  });

  it("matches the fixture's real CHORUS params (fx3)", () => {
    const chorusDefaults = defaultFxParams("CHORUS");

    expect(patch.fx3.type).toBe("CHORUS");
    expect(chorusDefaults).toStrictEqual({
      rate: 50, depth: 40, level: 100, preDelay: 4, direct: 100,
    });
    expect(patch.fx3.params).toMatchObject(chorusDefaults);
  });
});
