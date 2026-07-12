import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_CHAIN,
  moveBefore,
  normalizeChain,
  defaultFxParams,
  defaultForField,
  basePatch,
  amp,
  odds,
  clearOdds,
  fx,
  ns,
  fv,
  pfx,
  delay,
  reverb,
  saveTsl,
} from "../../../src/devices/gx1/builder";
import { decodePatch, encodePatch } from "../../../src/devices/gx1/codec";
import { bytesFromHex } from "../../../src/devices/gx1/codec/primitives";
import { readFile } from "../../../src/devices/gx1/tsl";

describe("basePatch", () => {
  it("defaults to DEFAULT_CHAIN", () => {
    const patch = basePatch("Lead");

    expect(patch.chain).toEqual(DEFAULT_CHAIN);
  });

  it("accepts a custom chain array", () => {
    const custom = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");

    const patch = basePatch("Test", custom);

    expect(patch.chain).toEqual(custom);
  });

  it("sets the patch name", () => {
    const patch = basePatch("My Patch");

    expect(patch.name).toBe("My Patch");
  });

  it("defaults key to C", () => {
    const patch = basePatch("Test");

    expect(patch.key).toBe("C");
  });

  it("accepts a custom key", () => {
    const patch = basePatch("Test", DEFAULT_CHAIN, "G");

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

    expect(moveMissingNode).toThrow(/not found in chain/);
  });

  // Real device values (a GX-1 was used to perform each reorder, then exported and
  // byte-diffed) — a wrong MEMORY%CHAIN encoding fails this, not just self-consistency.
  it("encodes an FX2-after-AMP reorder to the real device bytes", () => {
    const chain = moveBefore(DEFAULT_CHAIN, "FX2", "NS");
    const patch = basePatch("Test", chain);

    const encoded = encodePatch(patch);
    const chainBytes = bytesFromHex(encoded.paramSet["MEMORY%CHAIN"]);

    expect(chainBytes).toEqual([1, 2, 3, 4, 5, 7, 9, 8, 6, 10, 0, 11, 12]);
  });

  it("encodes an OD/DS-before-FX1 reorder to the real device bytes", () => {
    const chain = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");
    const patch = basePatch("Test", chain);

    const encoded = encodePatch(patch);
    const chainBytes = bytesFromHex(encoded.paramSet["MEMORY%CHAIN"]);

    expect(chainBytes).toEqual([1, 3, 4, 2, 7, 6, 9, 8, 5, 10, 0, 11, 12]);
  });
});

describe("normalizeChain", () => {
  it("returns DEFAULT_CHAIN unchanged when given the full chain in order", () => {
    const result = normalizeChain(DEFAULT_CHAIN);

    expect(result).toEqual(DEFAULT_CHAIN);
  });

  it("preserves the caller's relative order, inserting omitted blocks after their nearest present predecessor", () => {
    const partial = ["FX1", "OD/DS", "AMP", "FX2", "NS", "DLY", "REV"];

    const result = normalizeChain(partial);

    expect(result).toEqual(["PFX", "FX1", "OD/DS", "AMP", "FX2", "FX3", "NS", "FV", "DLY", "REV"]);
  });

  it("accepts \"OD\" as an alias for \"OD/DS\"", () => {
    const result = normalizeChain(["FX1", "OD", "AMP"]);

    expect(result).toEqual(["PFX", "FX1", "OD/DS", "AMP", "NS", "FV", "FX2", "FX3", "DLY", "REV"]);
  });

  it("throws on an unknown block name", () => {
    const normalizeWithBogusBlock = () => normalizeChain(["FX1", "BOGUS"]);

    expect(normalizeWithBogusBlock).toThrow(/unknown chain block "BOGUS"/);
  });

  it("throws on a duplicate block name", () => {
    const normalizeWithDuplicateBlock = () => normalizeChain(["FX1", "AMP", "FX1"]);

    expect(normalizeWithDuplicateBlock).toThrow(/duplicate chain block "FX1"/);
  });
});

describe("amp", () => {
  it("sets all amp fields", () => {
    const patch = basePatch("Test");

    amp(patch, "JC-120", 60, 55, 50, 45, '4x12"', "CND87", 90);

    expect(patch.amp.on).toBe(true);
    expect(patch.amp.type).toBe("JC-120");
    expect(patch.amp.gain).toBe(60);
    expect(patch.amp.bass).toBe(55);
    expect(patch.amp.middle).toBe(50);
    expect(patch.amp.treble).toBe(45);
    expect(patch.amp.speaker).toBe('4x12"');
    expect(patch.amp.mic).toBe("CND87");
    expect(patch.amp.level).toBe(90);
  });

  it("uses ORIGINAL speaker and DYN57 mic as defaults", () => {
    const patch = basePatch("Test");

    amp(patch, "TWIN", 50, 50, 50, 50);

    expect(patch.amp.speaker).toBe("ORIGINAL");
    expect(patch.amp.mic).toBe("DYN57");
    expect(patch.amp.level).toBe(100);
  });

  it("defaults solo to off and soloLevel to 50", () => {
    const patch = basePatch("Test");

    amp(patch, "TWIN", 50, 50, 50, 50);

    expect(patch.amp.solo).toBe(false);
    expect(patch.amp.soloLevel).toBe(50);
  });

  it("sets solo and soloLevel", () => {
    const patch = basePatch("Test");

    amp(patch, "TWIN", 50, 50, 50, 50, "ORIGINAL", "DYN57", 100, true, 80);

    expect(patch.amp.solo).toBe(true);
    expect(patch.amp.soloLevel).toBe(80);
  });
});

describe("odds", () => {
  it("sets all odds fields", () => {
    const patch = basePatch("Test");

    odds(patch, "BLUES OD", 70, 60, 80, 10);

    expect(patch.odds.on).toBe(true);
    expect(patch.odds.type).toBe("BLUES OD");
    expect(patch.odds.drive).toBe(70);
    expect(patch.odds.tone).toBe(60);
    expect(patch.odds.level).toBe(80);
    expect(patch.odds.direct).toBe(10);
  });

  it("defaults direct to 0", () => {
    const patch = basePatch("Test");

    odds(patch, "OVERDRIVE", 50, 50, 50);

    expect(patch.odds.direct).toBe(0);
  });

  it("defaults solo to off and soloLevel to 50", () => {
    const patch = basePatch("Test");

    odds(patch, "OVERDRIVE", 50, 50, 50);

    expect(patch.odds.solo).toBe(false);
    expect(patch.odds.soloLevel).toBe(50);
  });

  it("sets solo and soloLevel", () => {
    const patch = basePatch("Test");

    odds(patch, "OVERDRIVE", 50, 50, 50, 10, true, 75);

    expect(patch.odds.solo).toBe(true);
    expect(patch.odds.soloLevel).toBe(75);
  });
});

describe("clearOdds", () => {
  it("disables odds", () => {
    const patch = basePatch("Test");
    odds(patch, "OVERDRIVE", 50, 50, 50);

    expect(patch.odds.on).toBe(true);

    clearOdds(patch);

    expect(patch.odds.on).toBe(false);
  });
});

describe("fx", () => {
  it("sets fx1 block fields, filling in unset params with the type's defaults", () => {
    const patch = basePatch("Test");

    fx(patch, "fx1", "CHORUS", null, { rate: 50, depth: 60 });

    expect(patch.fx1.on).toBe(true);
    expect(patch.fx1.type).toBe("CHORUS");
    expect(patch.fx1.subType).toBeNull();
    expect(patch.fx1.params).toEqual({ rate: 50, depth: 60, level: 100, preDelay: 4, direct: 100 });
  });

  it("sets fx2 and fx3 independently", () => {
    const patch = basePatch("Test");

    fx(patch, "fx2", "FLANGER", null, { rate: 30 });
    fx(patch, "fx3", "DELAY", "STANDARD", { time: 200 });

    expect(patch.fx2.type).toBe("FLANGER");
    expect(patch.fx3.type).toBe("DELAY");
    expect(patch.fx3.subType).toBe("STANDARD");
  });

  it("defaults subType to null and params to the type's defaults when omitted", () => {
    const patch = basePatch("Test");

    fx(patch, "fx1", "TREMOLO");

    expect(patch.fx1.subType).toBeNull();
    expect(patch.fx1.params).toEqual({ rate: 0, depth: 0, level: 50 });
  });

  // FIXED WAH's model selector lives in param-block byte p[0] (PARAM_SUBTYPE_EFFECTS),
  // not FX_COM byte[2] — this proves both halves of that threading: fx() writing
  // subType into params.type on encode, and decodePatch promoting it back on decode.
  it("round-trips FIXED WAH's subType through encode/decode", () => {
    const patch = basePatch("Test");
    fx(patch, "fx1", "FIXED WAH", "VO WAH", { level: 80, direct: 20, manual: 60 });

    const encoded = encodePatch(patch);
    const decoded = decodePatch(encoded);

    expect(decoded.fx1.subType).toBe("VO WAH");
    expect(decoded.fx1.params).toMatchObject({ level: 80, direct: 20, manual: 60 });
  });

  // OVERTONE (FX3-only) stores its params in the separate MEMORY%FX3A block instead
  // of the shared 251-byte FX param block — proves both halves of that special-casing
  // in codec/patch.ts round-trip correctly.
  it("round-trips OVERTONE on fx3 through its dedicated MEMORY%FX3A block", () => {
    const patch = basePatch("Test");
    fx(patch, "fx3", "OVERTONE", null, { lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 });

    const encoded = encodePatch(patch);
    const decoded = decodePatch(encoded);

    expect(decoded.fx3.type).toBe("OVERTONE");
    expect(decoded.fx3.params).toMatchObject({ lower: 60, upper: 40, unison: 50, direct: 100, detune: 20 });
  });

  it("accepts an unrecognized FX type with no params, without throwing", () => {
    const patch = basePatch("Test");
    const setBogusType = () => { fx(patch, "fx1", "BOGUS TYPE"); };

    expect(setBogusType).not.toThrow();
    expect(patch.fx1.type).toBe("BOGUS TYPE");
    expect(patch.fx1.params).toEqual({});
  });

  it("throws when a param key isn't valid for the FX type (ROTARY's field is \"speed\", not \"speedSelect\")", () => {
    const patch = basePatch("Test");
    const setInvalidParam = () => { fx(patch, "fx1", "ROTARY", null, { speedSelect: "FAST" }); };

    expect(setInvalidParam).toThrow(/fx1 param "speedSelect" is not valid for type "ROTARY"/);
  });

  it("defaults unset GEQ bands to 0 dB instead of the signed-center raw byte", () => {
    const patch = basePatch("Test");

    fx(patch, "fx1", "HIGH GEQ", null, { level: 80, "4kHz": 5 });

    expect(patch.fx1.params).toEqual({
      "250Hz": 0, "500Hz": 0, "1kHz": 0, "2kHz": 0, "4kHz": 5, "8kHz": 0, level: 80,
    });
  });
});

describe("ns", () => {
  it("sets ns fields and enables it by default", () => {
    const patch = basePatch("Test");

    ns(patch, 40, 30);

    expect(patch.ns.on).toBe(true);
    expect(patch.ns.threshold).toBe(40);
    expect(patch.ns.release).toBe(30);
  });

  it("can set ns to off", () => {
    const patch = basePatch("Test");

    ns(patch, 40, 30, false);

    expect(patch.ns.on).toBe(false);
  });

  it("defaults detect to INPUT", () => {
    const patch = basePatch("Test");

    ns(patch, 40, 30);

    expect(patch.ns.detect).toBe("INPUT");
  });

  it("accepts an explicit detect mode", () => {
    const patch = basePatch("Test");

    ns(patch, 40, 30, true, "NS INPUT");

    expect(patch.ns.detect).toBe("NS INPUT");
  });
});

describe("fv", () => {
  it("sets all fv fields", () => {
    const patch = basePatch("Test");

    fv(patch, 80, 10, 90, "FAST");

    expect(patch.fv.position).toBe(80);
    expect(patch.fv.min).toBe(10);
    expect(patch.fv.max).toBe(90);
    expect(patch.fv.curve).toBe("FAST");
  });

  it("defaults curve to NORMAL", () => {
    const patch = basePatch("Test");

    fv(patch, 100, 0, 100);

    expect(patch.fv.curve).toBe("NORMAL");
  });
});

describe("pfx", () => {
  it("sets WAH fields and enables it by default", () => {
    const patch = basePatch("Test");
    const wahParams = { wahType: "VO WAH", level: 80, direct: 20, position: 90, min: 10, max: 100 };

    pfx(patch, "WAH", wahParams);

    const block = patch.pfx as Record<string, unknown>;
    expect(patch.pfx.on).toBe(true);
    expect(patch.pfx.type).toBe("WAH");
    expect(block.wahType).toBe("VO WAH");
    expect(block.level).toBe(80);
  });

  it("sets PEDAL BEND fields", () => {
    const patch = basePatch("Test");
    const pedalBendParams = { pitchMin: -12, pitchMax: 12, position: 100, level: 90, direct: 0 };

    pfx(patch, "PEDAL BEND", pedalBendParams);

    const block = patch.pfx as Record<string, unknown>;
    expect(patch.pfx.type).toBe("PEDAL BEND");
    expect(block.pitchMin).toBe(-12);
    expect(block.pitchMax).toBe(12);
  });

  it("throws when a param isn't valid for the pfx type", () => {
    const patch = basePatch("Test");
    const setInvalidParam = () => { pfx(patch, "WAH", { pitchMin: -12 }); };

    expect(setInvalidParam).toThrow(/pfx extra param "pitchMin" is not valid for type "WAH"/);
  });

  it("can disable pfx", () => {
    const patch = basePatch("Test");

    pfx(patch, "WAH", {}, false);

    expect(patch.pfx.on).toBe(false);
  });

  it("accepts an unrecognized type with no params, without throwing", () => {
    const patch = basePatch("Test");
    const setBogusType = () => { pfx(patch, "BOGUS TYPE", {}); };

    expect(setBogusType).not.toThrow();
    expect(patch.pfx.type).toBe("BOGUS TYPE");
  });

  it("fills every WAH field with sane defaults when called with no params", () => {
    const patch = basePatch("Test");

    pfx(patch, "WAH", {});

    const block = patch.pfx as Record<string, unknown>;
    expect(block.wahType).toBe("CRY WAH");
    expect(block.level).toBe(50);
    expect(block.direct).toBe(0);
    expect(block.position).toBe(0);
    expect(block.min).toBe(0);
    expect(block.max).toBe(0);
  });

  it("fills PEDAL BEND fields (including signed pitchMin/pitchMax) with sane defaults when called with no params", () => {
    const patch = basePatch("Test");

    pfx(patch, "PEDAL BEND", {});

    const block = patch.pfx as Record<string, unknown>;
    expect(block.pitchMin).toBe(0);
    expect(block.pitchMax).toBe(0);
    expect(block.position).toBe(0);
    expect(block.level).toBe(50);
    expect(block.direct).toBe(0);
  });

  it("lets a partial params object override only some defaults", () => {
    const patch = basePatch("Test");

    pfx(patch, "WAH", { level: 90 });

    const block = patch.pfx as Record<string, unknown>;
    expect(block.level).toBe(90);
    expect(block.wahType).toBe("CRY WAH");
  });
});

describe("delay", () => {
  it("sets all delay fields", () => {
    const patch = basePatch("Test");

    delay(patch, "STANDARD", 7, 50, 60, "FLAT");

    expect(patch.delay.on).toBe(true);
    expect(patch.delay.type).toBe("STANDARD");
    expect(patch.delay.time).toBe(7);
    expect(patch.delay.feedback).toBe(50);
    expect(patch.delay.level).toBe(60);
    expect(patch.delay.highCut).toBe("FLAT");
  });

  it("stores the high cut label string directly", () => {
    const patch = basePatch("Test");

    delay(patch, "ANALOG", 1, 40, 50, "2kHz");

    expect(patch.delay.highCut).toBe("2kHz");
  });

  it("throws on encode for an unrecognized high cut label", () => {
    const patch = basePatch("Test");
    delay(patch, "PAN", 1, 30, 40, "UNKNOWN");

    const encodeWithBadHighCut = () => { encodePatch(patch); };

    expect(encodeWithBadHighCut).toThrow(/Unknown highCut value: "UNKNOWN"/);
  });

  it("merges extra params", () => {
    const patch = basePatch("Test");

    delay(patch, "MODULATE", 1, 50, 50, "FLAT", true, { modRate: 5 });

    const block = patch.delay as Record<string, unknown>;
    expect(block.modRate).toBe(5);
  });

  it("throws when an extra param isn't valid for the delay type", () => {
    const patch = basePatch("Test");
    const setInvalidExtra = () => { delay(patch, "STANDARD", 7, 50, 60, "FLAT", true, { modRate: 5 }); };

    expect(setInvalidExtra).toThrow(/extra param "modRate" is not valid for type "STANDARD"/);
  });

  it("can disable delay", () => {
    const patch = basePatch("Test");

    delay(patch, "STANDARD", 7, 50, 60, "FLAT", false);

    expect(patch.delay.on).toBe(false);
  });

  it("fills SHIMMER's type-specific pitch/balance fields (not covered by any positional param) with sane defaults", () => {
    const patch = basePatch("Test");

    delay(patch, "SHIMMER", 1, 40, 50, "FLAT");

    const block = patch.delay as Record<string, unknown>;
    expect(block.pitch).toBe(0);
    expect(block.balance).toBe(0);
  });

  it("fills WARP's trigger field (entirely uncovered by delay()'s positional params) with a sane default", () => {
    const patch = basePatch("Test");

    delay(patch, "WARP", 1, 40, 50);

    const block = patch.delay as Record<string, unknown>;
    expect(block.trigger).toBe(0);
    expect(block.level).toBe(50);
  });
});

describe("reverb", () => {
  it("sets all reverb fields", () => {
    const patch = basePatch("Test");

    reverb(patch, "HALL M", 2.5, 80, 10, 5, 7, 90);

    expect(patch.reverb.on).toBe(true);
    expect(patch.reverb.type).toBe("HALL M");
    expect(patch.reverb.time).toBe(2.5);
    expect(patch.reverb.level).toBe(80);
    expect(patch.reverb.preDelay).toBe(10);
    expect(patch.reverb.tone).toBe(5);
    expect(patch.reverb.density).toBe(7);
    expect(patch.reverb.direct).toBe(90);
  });

  it("uses sensible defaults for optional params", () => {
    const patch = basePatch("Test");

    reverb(patch, "ROOM S", 1.0, 70);

    expect(patch.reverb.preDelay).toBe(0);
    expect(patch.reverb.tone).toBe(0);
    expect(patch.reverb.density).toBe(5);
    expect(patch.reverb.direct).toBe(100);
  });

  it("merges extra params", () => {
    const patch = basePatch("Test");

    reverb(patch, "SHIMMER", 3.0, 60, 0, 0, 5, 100, true, { pitch: 12 });

    const block = patch.reverb as Record<string, unknown>;
    expect(block.pitch).toBe(12);
  });

  it("throws when an extra param isn't valid for the reverb type", () => {
    const patch = basePatch("Test");
    const setInvalidExtra = () => { reverb(patch, "PLATE", 1.5, 50, 0, 0, 5, 100, true, { pitch: 12 }); };

    expect(setInvalidExtra).toThrow(/extra param "pitch" is not valid for type "PLATE"/);
  });

  it("can disable reverb", () => {
    const patch = basePatch("Test");

    reverb(patch, "PLATE", 1.5, 50, 0, 0, 5, 100, false);

    expect(patch.reverb.on).toBe(false);
  });

  it("fills SUB DELAY's feedback/highCut fields (not covered by any positional param) with sane defaults, preferring FLAT over the table's first entry", () => {
    const patch = basePatch("Test");

    reverb(patch, "SUB DELAY", 1, 60);

    const block = patch.reverb as Record<string, unknown>;
    expect(block.feedback).toBe(0);
    expect(block.highCut).toBe("FLAT");
  });

  it("fills SHIMMER's pitch field with a sane default when the caller doesn't pass it via extra", () => {
    const patch = basePatch("Test");

    reverb(patch, "SHIMMER", 1, 60);

    const block = patch.reverb as Record<string, unknown>;
    expect(block.pitch).toBe(0);
  });
});

// Anchors defaultFxParams to the one real captured factory-default source we have:
// core/tests/fixtures/gx1/default-init.tsl. For each FX type actually present there,
// defaultFxParams(type) must match what the real device shows for that type's params
// — this is what would have caught the class of bug where an unset GEQ band decoded
// to −20 dB instead of 0 dB, if defaultFxParams had existed and drifted from reality.
describe("defaultFxParams (anchored to default-init.tsl)", () => {
  const FIXTURE = resolve(import.meta.dirname, "../../fixtures/gx1/default-init.tsl");
  const file = readFile(FIXTURE);
  const patch = file.patches[0];

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

describe("defaultForField", () => {
  it("throws for a malformed lookup/indexTable field with no table entries", () => {
    const malformedField = { name: "bogus", kind: "lookup" as const, table: [], decode: () => "", encode: () => undefined };

    const getDefaultForMalformedField = () => defaultForField(malformedField);

    expect(getDefaultForMalformedField).toThrow('Field "bogus" has kind "lookup" but no table entries');
  });
});

describe("saveTsl", () => {
  const tmpPath = join(tmpdir(), `tonesmith-builder-test-${process.pid}.tsl`);

  afterEach(() => {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
    vi.restoreAllMocks();
  });

  it("writes a file that can be read back", async () => {
    const { readFile } = await import("../../../src/devices/gx1/tsl");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const patch = basePatch("Save Test");
    amp(patch, "JC-120", 50, 50, 50, 50);

    saveTsl([patch], "Save Test Set", tmpPath);

    const loaded = readFile(tmpPath);
    expect(loaded.patches).toHaveLength(1);
    expect(loaded.patches[0].name).toBe("Save Test");
  });

  it("logs the output path via console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const patch = basePatch("Log Test");

    saveTsl([patch], "Log Set", tmpPath);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining(tmpPath));
  });
});
