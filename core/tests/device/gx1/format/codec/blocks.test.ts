import { describe, it, expect } from "vitest";
import {
  TYPED_BLOCKS, decodeTypedBlock, encodeTypedBlock, decodeChain, encodeChain, validateChain,
  decodePedalFx, encodePedalFx, decodeFxCom, encodeFxCom, fieldsFor,
  decodeSettings, encodeSettings, decodeNoiseGate, encodeNoiseGate, decodeVolume, encodeVolume,
  decodeName, encodeName,
} from "../../../../../src/device/gx1/format/codec/blocks";
import { bytesFromHex, hexFromBytes } from "../../../../../src/device/gx1/format/codec/primitives";
import { REV_TYPE_MAPS } from "../../../../../src/device/gx1/format/codec/blocks";
import {
  DLY_TYPES, REV_TYPES, DLY_TYPE_IDX, REV_TYPE_IDX, PFX_TYPE_IDX, FX_TYPE_IDX, WAH_TYPES,
  RAW, DEFAULT_CHAIN,
} from "../../../../../src/device/gx1/model";
import { DEFAULT_INIT_FIXTURE, patchAt, rawBlock, moveBefore } from "../../helpers";

const defaultInitPatch = await patchAt(DEFAULT_INIT_FIXTURE);

describe("Delay block symmetry (all types)", () => {
  it.each(DLY_TYPES)("%s: encode(decode(zeros)) equals decode(zeros)", (dlyType) => {
    const bytes = new Array<number>(29).fill(0);
    bytes[0] = 1;
    bytes[1] = DLY_TYPE_IDX[dlyType];
    const hexList = hexFromBytes(bytes);

    const decoded = decodeTypedBlock(TYPED_BLOCKS.delay, hexList);
    const reencoded = encodeTypedBlock(TYPED_BLOCKS.delay, decoded);
    const reDecoded = decodeTypedBlock(TYPED_BLOCKS.delay, reencoded);

    expect(reDecoded).toStrictEqual(decoded);
  });
});

describe("Reverb block symmetry (all types)", () => {
  it.each(REV_TYPES)("%s: encode(decode(zeros)) equals decode(zeros)", (revType) => {
    const bytes = new Array<number>(20).fill(0);
    bytes[0] = 1;
    bytes[1] = REV_TYPE_IDX[revType];
    const hexList = hexFromBytes(bytes);

    const decoded = decodeTypedBlock(TYPED_BLOCKS.reverb, hexList);
    const reencoded = encodeTypedBlock(TYPED_BLOCKS.reverb, decoded);
    const reDecoded = decodeTypedBlock(TYPED_BLOCKS.reverb, reencoded);

    expect(reDecoded).toStrictEqual(decoded);
  });
});

// MEMORY%CHAIN is a linked list (see CHAIN_SLOT_ORDER in model/constants.ts), not a positional
// array: byte 0 is whichever block comes first, and byte (1 + CHAIN_SLOT_ORDER.indexOf(name)) is
// the firmware value of whatever follows that specific block. These byte arrays are real values
// read off a GX-1 after performing each reorder on the device itself, not self-consistency
// round trips.
describe("Chain block (real device values)", () => {
  const DEFAULT_BYTES = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 11, 12];
  const DEFAULT_ORDER = ["pedalFx", "fx1", "drive", "amp", "noiseGate", "volume", "fx2", "fx3", "delay", "reverb"];

  const CHAIN_CASES = [
    { label: "the untouched default chain", bytes: DEFAULT_BYTES, order: DEFAULT_ORDER },
    {
      label: "an FX2/FX3 swap",
      bytes: [1, 2, 3, 4, 7, 9, 5, 8, 6, 10, 0, 11, 12],
      order: ["pedalFx", "fx1", "drive", "amp", "noiseGate", "volume", "fx3", "fx2", "delay", "reverb"],
    },
    {
      label: "an AMP/OD-DS swap",
      bytes: [1, 2, 4, 7, 3, 6, 9, 8, 5, 10, 0, 11, 12],
      order: ["pedalFx", "fx1", "amp", "drive", "noiseGate", "volume", "fx2", "fx3", "delay", "reverb"],
    },
    {
      label: "an fx2-after-noiseGate reorder",
      bytes: [1, 2, 3, 4, 5, 7, 9, 8, 6, 10, 0, 11, 12],
      order: moveBefore(DEFAULT_ORDER, "fx2", "noiseGate"),
    },
    {
      label: "a drive-before-fx1 reorder",
      bytes: [1, 3, 4, 2, 7, 6, 9, 8, 5, 10, 0, 11, 12],
      order: moveBefore(DEFAULT_ORDER, "drive", "fx1"),
    },
  ];

  it.each(CHAIN_CASES)("decodes $label", ({ bytes, order }) => {
    const decoded = decodeChain(hexFromBytes(bytes));

    expect(decoded).toStrictEqual(order);
  });

  it.each(CHAIN_CASES)("encodes $label to the real device bytes", ({ bytes, order }) => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);

    const encoded = encodeChain(order, originalHex);

    expect(encoded).toStrictEqual(hexFromBytes(bytes));
  });

  it("preserves unused trailing bytes from the original param set", () => {
    const originalWithJunk = [1, 2, 3, 4, 7, 6, 9, 8, 5, 10, 0, 99, 42];
    const originalHex = hexFromBytes(originalWithJunk);

    const encodedHex = encodeChain(DEFAULT_ORDER, originalHex);
    const result = bytesFromHex(encodedHex);
    const trailingBytes = result.slice(11);

    expect(trailingBytes).toStrictEqual([99, 42]);
  });

  it("encodeChain refuses an invalid chain before writing anything", () => {
    const originalHex = hexFromBytes(DEFAULT_BYTES);

    expect(() => { encodeChain([...DEFAULT_ORDER, "amp"], originalHex); }).toThrow();
  });

  describe("validateChain", () => {
    // The firmware stores the chain as a linked list keyed by block, so a repeat overwrites its own
    // slot and drops every block between the two occurrences. A chain that "succeeds" while
    // silently losing blocks has to be refused outright.
    it("refuses a chain that repeats a block", () => {
      const duplicated = [...DEFAULT_ORDER, "amp"];

      expect(() => { validateChain(duplicated); }).toThrow(/amp/);
    });

    it("names every missing block when the chain is incomplete", () => {
      const validatePartialChain = () => { validateChain(["drive", "fx1"]); };

      // The blocks left out are the whole fix a caller has to make, so the message has to list them.
      expect(validatePartialChain).toThrow(/pedalFx/);
      expect(validatePartialChain).toThrow(/reverb/);
    });

    it("names every valid block when refusing an unknown one", () => {
      const bogus = DEFAULT_ORDER.map(name => (name === "noiseGate" ? "gate" : name));

      expect(() => { validateChain(bogus); }).toThrow(new RegExp(DEFAULT_CHAIN.join(", ")));
    });

    // write_fields and the CLI both hand through whatever a dot-path edit produced, so a caller
    // who sets `chain` to a bare string reaches the codec with a non-array.
    it("refuses a chain that isn't a list, naming the blocks it expects", () => {
      expect(() => { validateChain("fx1,amp"); })
        .toThrow(new RegExp(DEFAULT_CHAIN.join(", ")));
    });
  });
});

// The device's own factory bytes for MEMORY%OTHER, what `blankPatch` opens every patch at.
const FACTORY_SETTING_BYTES = [6, 4, 7, 8, 0, 1, 0];

describe("Patch settings", () => {
  it("decodes every setting from the device's factory bytes", () => {
    const decoded = decodeSettings(hexFromBytes(FACTORY_SETTING_BYTES));

    expect(decoded).toStrictEqual({
      memoryLevel: 100,
      bpm: 120,
      key: "C",
      carryover: true,
      tempoHold: false,
    });
  });

  it("encodes what it decoded back to the same bytes", () => {
    const originalHex = hexFromBytes(FACTORY_SETTING_BYTES);

    const reencoded = encodeSettings(decodeSettings(originalHex), originalHex);

    expect(reencoded).toStrictEqual(originalHex);
  });

  it("changes one setting and leaves the other bytes as they were", () => {
    const originalHex = hexFromBytes(FACTORY_SETTING_BYTES);
    const settings = { ...decodeSettings(originalHex), key: "G" };

    const result = bytesFromHex(encodeSettings(settings, originalHex));

    expect(result).toStrictEqual([6, 4, 7, 8, 7, 1, 0]);
  });

  it("splits each 8-bit setting across its two nibbles at the top of its range", () => {
    const originalHex = hexFromBytes(FACTORY_SETTING_BYTES);
    const settings = { ...decodeSettings(originalHex), memoryLevel: 200, bpm: 250 };

    const result = bytesFromHex(encodeSettings(settings, originalHex));

    expect(result).toStrictEqual([12, 8, 15, 10, 0, 1, 0]);
  });

  it("round-trips a setting stored across two nibbles", () => {
    const originalHex = hexFromBytes(FACTORY_SETTING_BYTES);
    const settings = { ...decodeSettings(originalHex), bpm: 137 };

    const reencoded = encodeSettings(settings, originalHex);

    expect(decodeSettings(reencoded).bpm).toBe(137);
  });

  it("throws encoding a setting the device has no name for", () => {
    const originalHex = hexFromBytes(FACTORY_SETTING_BYTES);
    const settings = { ...decodeSettings(originalHex), key: "BOGUS" };

    const encodeBadKey = () => { encodeSettings(settings, originalHex); };

    expect(encodeBadKey).toThrow(/BOGUS/);
  });

  it("throws encoding a bpm past the two-nibble maximum", () => {
    const originalHex = hexFromBytes(FACTORY_SETTING_BYTES);
    const settings = { ...decodeSettings(originalHex), bpm: 256 };

    const encodeTooHighBpm = () => { encodeSettings(settings, originalHex); };

    expect(encodeTooHighBpm).toThrow(RangeError);
  });
});

describe("Malformed/unmapped byte handling", () => {
  it.each([
    { label: "an unmapped chain value at the very start", bytes: [99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], order: [] },
    { label: "an unmapped chain value partway through", bytes: [1, 99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], order: ["pedalFx"] },
    {
      label: "a cyclic chain, stopped at the number of blocks there are",
      bytes: [2, 0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      order: ["fx1", "drive", "fx1", "drive", "fx1", "drive", "fx1", "drive", "fx1", "drive"],
    },
  ])("decodeChain stops and returns a partial order for $label", ({ bytes, order }) => {
    const decoded = decodeChain(hexFromBytes(bytes));

    expect(decoded).toStrictEqual(order);
  });

  it("decodeChain gives a short chain for a terminator that lands mid-list", () => {
    const bytes = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const decoded = decodeChain(hexFromBytes(bytes));

    expect(decoded).toStrictEqual(["pedalFx"]);
  });

  it("encodeNoiseGate preserves an out-of-range detect byte instead of overwriting it", () => {
    const bytes = [1, 30, 30, 99]; // byte 3 = 99, outside NS_DETECT's 2-entry range
    const hexList = hexFromBytes(bytes);
    const decoded = decodeNoiseGate(hexList);

    const encodedHex = encodeNoiseGate(decoded);
    const reencoded = bytesFromHex(encodedHex);

    expect(reencoded[3]).toBe(99);
  });

  it("decodeNoiseGate decodes the on byte", () => {
    const decoded = decodeNoiseGate(hexFromBytes([1, 30, 30, 0]));

    expect(decoded.on).toBe(true);
  });

  it("decodeVolume defaults curve to NORMAL when the raw array has no 4th byte", () => {
    const hexList = hexFromBytes([100, 0, 100]);

    const decoded = decodeVolume(hexList);

    expect(decoded.params.curve).toBe("NORMAL");
  });

  it("encodeVolume leaves a 3-byte raw array untouched (no curve byte to write)", () => {
    const bytes = [100, 0, 100];
    const hexList = hexFromBytes(bytes);
    const decoded = decodeVolume(hexList);

    const encodedHex = encodeVolume(decoded);
    const result = bytesFromHex(encodedHex);

    expect(result).toStrictEqual(bytes);
  });

  it("encodeVolume preserves an out-of-range curve byte instead of overwriting it", () => {
    const bytes = [100, 0, 100, 99]; // byte 3 = 99, outside FV_CURVE's 4-entry range
    const hexList = hexFromBytes(bytes);
    const decoded = decodeVolume(hexList);

    const encodedHex = encodeVolume(decoded);
    const result = bytesFromHex(encodedHex);

    expect(result[3]).toBe(99);
  });

  it.each([
    { label: "delay", codec: TYPED_BLOCKS.delay, length: 29 },
    { label: "reverb", codec: TYPED_BLOCKS.reverb, length: 20 },
  ])("decodeTypedBlock returns a bare on/type block for a $label byte outside its known type range", ({ codec, length }) => {
    const bytes = new Array<number>(length).fill(0);
    bytes[1] = 250;
    const hexList = hexFromBytes(bytes);

    const decoded = decodeTypedBlock(codec, hexList);

    expect(decoded).toStrictEqual({ on: false, type: "UNKNOWN_250", params: {}, [RAW]: bytes });
  });

  it("decodePedalFx returns a bare on/type block for a byte outside the known PFX_TYPES range", () => {
    const bytes = new Array<number>(14).fill(0);
    bytes[1] = 250;
    const hexList = hexFromBytes(bytes);

    const decoded = decodePedalFx(hexList);

    expect(decoded).toStrictEqual({ on: false, type: "UNKNOWN_250", subType: null, params: {}, [RAW]: bytes });
  });
});

describe("Name block", () => {
  it("round-trips a name byte the device's own character set does not reach", () => {
    const bytes = [0x41, 0xC3, 0xA9, ...new Array<number>(13).fill(0x20)];

    const reencoded = bytesFromHex(encodeName(decodeName(hexFromBytes(bytes))));

    expect(reencoded).toStrictEqual(bytes);
  });

  it("pads a short name out to the full block with spaces", () => {
    const encoded = bytesFromHex(encodeName("AB"));

    expect(encoded).toStrictEqual([0x41, 0x42, ...new Array<number>(14).fill(0x20)]);
  });

  it("pads an empty name out to 16 spaces", () => {
    const encoded = bytesFromHex(encodeName(""));

    expect(encoded).toStrictEqual(new Array<number>(16).fill(0x20));
  });

  it("stores a name exactly 16 characters long, filling the block", () => {
    const name = "1234567890123456";

    const encoded = bytesFromHex(encodeName(name));

    expect(decodeName(hexFromBytes(encoded))).toBe(name);
  });

  it("throws on a name longer than the block rather than storing a truncation", () => {
    const encodeLongName = () => encodeName("x".repeat(17));

    expect(encodeLongName).toThrow(/16/);
  });

  it("throws naming a character above the byte the block can store", () => {
    const encodeUnstorable = () => encodeName("a\u{1F600}");

    expect(encodeUnstorable).toThrow(/\u{1F600}/u);
  });

  it("trims trailing spaces but keeps leading ones", () => {
    const decoded = decodeName(hexFromBytes([0x20, 0x41, 0x42, ...new Array<number>(13).fill(0x20)]));

    expect(decoded).toBe(" AB");
  });
});

describe("Values the device has no byte for", () => {
  it("encodeNoiseGate throws on a detect the device does not name", () => {
    const block = { on: true, params: { threshold: 30, release: 30, detect: "BOGUS" }, [RAW]: [1, 30, 30, 0] };

    const encodeBadDetect = () => encodeNoiseGate(block);

    expect(encodeBadDetect).toThrow(/BOGUS/);
  });

  it("encodeVolume throws on a curve the device does not name", () => {
    const block = { params: { position: 100, min: 0, max: 100, curve: "BOGUS" }, [RAW]: [100, 0, 100, 2] };

    const encodeBadCurve = () => encodeVolume(block);

    expect(encodeBadCurve).toThrow(/BOGUS/);
  });

  it("encodeTypedBlock names the amp control whose value is not a byte", () => {
    const block = decodeTypedBlock(TYPED_BLOCKS.amp, hexFromBytes(new Array<number>(13).fill(0)));
    block.params.gain = 500;

    const encodeBadGain = () => encodeTypedBlock(TYPED_BLOCKS.amp, block);

    expect(encodeBadGain).toThrow(/gain/);
  });

  it("encodeTypedBlock throws naming the block label for an unrecognized type", () => {
    const block = decodeTypedBlock(TYPED_BLOCKS.amp, hexFromBytes(new Array<number>(13).fill(0)));
    block.type = "BOGUS";

    const encodeBadType = () => encodeTypedBlock(TYPED_BLOCKS.amp, block);

    expect(encodeBadType).toThrow(/AMP/);
    expect(encodeBadType).toThrow(/BOGUS/);
  });

  it("encodeDelay throws on a high cut the device does not name", () => {
    const bytes = new Array<number>(29).fill(0);
    bytes[1] = DLY_TYPE_IDX.PAN;
    const block = decodeTypedBlock(TYPED_BLOCKS.delay, hexFromBytes(bytes));
    block.params.highCut = "UNKNOWN";

    const encodeWithBadHighCut = () => encodeTypedBlock(TYPED_BLOCKS.delay, block);

    expect(encodeWithBadHighCut).toThrow(/UNKNOWN/);
  });
});

describe("encodeTypedBlock and decodeTypedBlock", () => {
  it("writes a sentinel type back to the index it was decoded from", () => {
    const bytes = new Array<number>(13).fill(0);
    bytes[1] = 250;
    const decoded = decodeTypedBlock(TYPED_BLOCKS.amp, hexFromBytes(bytes));

    const encoded = bytesFromHex(encodeTypedBlock(TYPED_BLOCKS.amp, decoded));

    expect(encoded[1]).toBe(250);
  });

  it("writes only on and type for a type with no field list, leaving the rest untouched", () => {
    const bytes = new Array<number>(29).fill(9);
    bytes[1] = 250; // no DELAY_TYPE_MAPS entry
    const decoded = decodeTypedBlock(TYPED_BLOCKS.delay, hexFromBytes(bytes));
    decoded.on = true;

    const encoded = bytesFromHex(encodeTypedBlock(TYPED_BLOCKS.delay, decoded));

    expect(encoded[0]).toBe(1);
    expect(encoded[1]).toBe(250);
    expect(encoded.slice(2)).toStrictEqual(bytes.slice(2));
  });

  it("throws naming the label for a block shorter than 2 bytes", () => {
    const decodeShortBlock = () => decodeTypedBlock(TYPED_BLOCKS.amp, hexFromBytes([1]));

    expect(decodeShortBlock).toThrow(/AMP/);
  });
});

describe("decodeFxCom and encodeFxCom", () => {
  it("decodes the on byte, the type name, and a null subType", () => {
    const bytes = [1, FX_TYPE_IDX.COMPRESSOR, 5];

    const decoded = decodeFxCom(hexFromBytes(bytes));

    expect(decoded).toStrictEqual({ on: true, type: "COMPRESSOR", subType: null, [RAW]: bytes });
  });

  it("decodes an unrecognized type byte as its sentinel", () => {
    const decoded = decodeFxCom(hexFromBytes([1, 250, 5]));

    expect(decoded.type).toBe("UNKNOWN_FX250");
  });

  it("encodeFxCom writes bytes 0 and 1, leaving byte 2 (the bass-mode mirror) untouched", () => {
    const block = { on: true, type: "COMPRESSOR", subType: null, params: {}, [RAW]: [0, 0, 42] };

    const encoded = bytesFromHex(encodeFxCom(block));

    expect(encoded).toStrictEqual([1, FX_TYPE_IDX.COMPRESSOR, 42]);
  });
});

describe("decodePedalFx and encodePedalFx", () => {
  it("lifts the WAH model to subType, out of params", () => {
    const bytes = new Array<number>(14).fill(0);
    bytes[0] = 1;
    bytes[1] = PFX_TYPE_IDX.WAH;
    bytes[2] = WAH_TYPES.indexOf("VO WAH");

    const decoded = decodePedalFx(hexFromBytes(bytes));

    expect(decoded.subType).toBe("VO WAH");
    expect(decoded.params).not.toHaveProperty("subType");
  });

  it("writes the WAH model back to byte 2", () => {
    const bytes = new Array<number>(14).fill(0);
    bytes[0] = 1;
    bytes[1] = PFX_TYPE_IDX.WAH;
    const decoded = decodePedalFx(hexFromBytes(bytes));
    decoded.subType = "FAT WAH";

    const encoded = bytesFromHex(encodePedalFx(decoded));

    expect(encoded[2]).toBe(WAH_TYPES.indexOf("FAT WAH"));
  });
});

describe("fieldsFor", () => {
  it("routes an fx block through fxFieldsFor, honoring the subType", () => {
    const delayFields = fieldsFor("fx", "DELAY", "WARP");

    expect(delayFields?.map(f => f.name)).toContain("trigger");
  });

  it("groups a typed block's fields by its type", () => {
    expect(fieldsFor("delay", "STANDARD")?.map(f => f.name)).toContain("highCut");
    expect(fieldsFor("delay", "WARP")?.map(f => f.name)).toContain("trigger");
  });

  it("gives noiseGate and volume their one fixed list regardless of type", () => {
    expect(fieldsFor("noiseGate")?.map(f => f.name)).toContain("threshold");
    expect(fieldsFor("volume")?.map(f => f.name)).toContain("curve");
  });

  it("returns undefined for a group it doesn't know", () => {
    expect(fieldsFor("bogus")).toBeUndefined();
  });

  it.each(["HALL S", "HALL M", "PLATE", "ROOM S", "ROOM L", "AMBIENCE", "SPRING"])(
    "gives %s the shared standard reverb field list",
    (type) => {
      expect(fieldsFor("reverb", type)).toBe(REV_TYPE_MAPS.STANDARD);
    }
  );
});

// default-init.tsl is a real GX-1 factory-default patch export. Every case below asserts against
// that patch's own real bytes. A delay/reverb/pfx type that ISN'T the patch's active type still has
// the device's own factory-default bytes sitting in its "shadow" byte range (the union region
// shared by all types of that slot), so overriding just the type selector and decoding the same
// real bytes still exercises genuine device data.
describe("Real device values (default-init.tsl)", () => {
  const patch = defaultInitPatch;

  it("decodes the active chain order", () => {
    expect(patch.chain).toStrictEqual(DEFAULT_CHAIN);
  });

  it.each([
    {
      label: "drive", key: "MEMORY%ODDS", decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.drive, hex),
      expected: { type: "OVERDRIVE", params: { drive: 50, tone: 0, level: 50, direct: 0, solo: false, soloLevel: 50 } },
    },
    {
      label: "AMP", key: "MEMORY%AMP", decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.amp, hex),
      expected: {
        type: "NATURAL",
        params: { speaker: "ORIGINAL", gain: 50, level: 50, bass: 50, middle: 50, treble: 50, mic: "DYN421", solo: false, soloLevel: 50 },
      },
    },
    {
      label: "PFX", key: "MEMORY%PFX", decode: decodePedalFx,
      expected: { on: false, type: "WAH", subType: "CRY WAH", params: { level: 100, direct: 0, position: 100, min: 0, max: 100 } },
    },
    { label: "NS", key: "MEMORY%NS", decode: decodeNoiseGate, expected: { params: { threshold: 30, release: 30 } } },
    { label: "FV", key: "MEMORY%FV", decode: decodeVolume, expected: { params: { position: 100, min: 0, max: 100 } } },
    {
      label: "the dedicated DLY block", key: "MEMORY%DLY", decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.delay, hex),
      expected: { type: "STANDARD", params: { time: 400, feedback: 30, level: 50, highCut: "6.3kHz" } },
    },
    {
      label: "the dedicated REV block", key: "MEMORY%REV", decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.reverb, hex),
      expected: { type: "HALL M", params: { time: 2.6, tone: 0, density: 5, level: 25, preDelay: 30, direct: 100 } },
    },
  ])("decodes $label from the device's real factory bytes", ({ key, decode, expected }) => {
    const decoded = decode(rawBlock(patch, key));

    expect(decoded).toMatchObject(expected);
  });

  it.each([
    {
      label: "DLY MODULATE", key: "MEMORY%DLY", typeIndex: DLY_TYPE_IDX.MODULATE,
      decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.delay, hex),
      expectedParams: { time: 400, feedback: 30, level: 50, highCut: "6.3kHz", modRate: 50, modDepth: 30 },
    },
    {
      label: "DLY ANALOG", key: "MEMORY%DLY", typeIndex: DLY_TYPE_IDX.ANALOG,
      decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.delay, hex),
      expectedParams: { time: 400, feedback: 30, level: 50, highCut: "6.3kHz" },
    },
    {
      label: "DLY WARP", key: "MEMORY%DLY", typeIndex: DLY_TYPE_IDX.WARP,
      decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.delay, hex),
      expectedParams: { time: 400, trigger: false, level: 50 },
    },
    {
      label: "DLY GLITCH", key: "MEMORY%DLY", typeIndex: DLY_TYPE_IDX.GLITCH,
      decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.delay, hex),
      expectedParams: { trigger: false, time: 50, glitch: 50, balance: 100 },
    },
    {
      label: "REV SHIMMER", key: "MEMORY%REV", typeIndex: REV_TYPE_IDX.SHIMMER,
      decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.reverb, hex),
      expectedParams: { time: 2.6, tone: 0, level: 25, preDelay: 30, pitch: 12, pitchLevel: 100 },
    },
    {
      label: "REV SUB DELAY", key: "MEMORY%REV", typeIndex: REV_TYPE_IDX["SUB DELAY"],
      decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.reverb, hex),
      expectedParams: { time: 400, level: 50, feedback: 30, highCut: "6.3kHz" },
    },
    {
      label: "REV TERA ECHO", key: "MEMORY%REV", typeIndex: REV_TYPE_IDX["TERA ECHO"],
      decode: (hex: string[]) => decodeTypedBlock(TYPED_BLOCKS.reverb, hex),
      expectedParams: { tone: 0, level: 25, direct: 100, feedback: 30, spreadTime: 50, trigger: false },
    },
    {
      label: "PFX PEDAL BEND", key: "MEMORY%PFX", typeIndex: PFX_TYPE_IDX["PEDAL BEND"],
      decode: decodePedalFx,
      expectedParams: { pitchMin: 0, pitchMax: 24, position: 100, level: 100, direct: 0 },
    },
  ])("decodes $label shadow bytes from the device's real factory bytes", ({ key, typeIndex, decode, expectedParams }) => {
    const bytes = bytesFromHex(rawBlock(patch, key));
    const swapped = [...bytes.slice(0, 1), typeIndex, ...bytes.slice(2)];

    const decoded = decode(hexFromBytes(swapped));

    expect(decoded.params).toMatchObject(expectedParams);
  });

  it("decodes the ANALOG delay's own 4-byte time at its own 1200 ms ceiling", () => {
    const bytes = bytesFromHex(rawBlock(patch, "MEMORY%DLY"));
    const swapped = [...bytes.slice(0, 1), DLY_TYPE_IDX.ANALOG, ...bytes.slice(2)];
    swapped[13] = 0; swapped[14] = 4; swapped[15] = 11; swapped[16] = 0; // 1200

    const decoded = decodeTypedBlock(TYPED_BLOCKS.delay, hexFromBytes(swapped));

    expect(decoded.params.time).toBe(1200);
  });

  it("decodes the ANALOG delay's own 4-byte time as its first note at 1201 ms", () => {
    const bytes = bytesFromHex(rawBlock(patch, "MEMORY%DLY"));
    const swapped = [...bytes.slice(0, 1), DLY_TYPE_IDX.ANALOG, ...bytes.slice(2)];
    swapped[13] = 0; swapped[14] = 4; swapped[15] = 11; swapped[16] = 1; // 1201

    const decoded = decodeTypedBlock(TYPED_BLOCKS.delay, hexFromBytes(swapped));

    expect(decoded.params.time).toBe("1/32");
  });
});
