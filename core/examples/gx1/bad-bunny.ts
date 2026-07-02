import { gx1 } from "@tonesmith/core";
const { basePatch, amp, odds, clearOdds, fx, ns, delay, reverb, saveTsl, DEFAULT_CHAIN, moveBefore } = gx1;

// FX2 relocated to right after AMP, before NS.
const CHAIN_FX2_AFTER_AMP = moveBefore(DEFAULT_CHAIN, "FX2", "NS");
// OD/DS relocated to before FX1.
const CHAIN_OD_BEFORE_FX1 = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");
// REV relocated to before DLY.
const CHAIN_REV_BEFORE_DLY = moveBefore(DEFAULT_CHAIN, "REV", "DLY");

const patches = [];

// OL-1  Ojitos Lindos — FX1 (Chorus) → AMP → NS → DELAY → SHIMMER REV
const ol1 = basePatch("OL-1 OJITOS");
amp(ol1, "TRNSPRNT", 12, 48, 45, 55, '1x12"', "RIBON121");
fx(ol1, "fx1", "CHORUS", "STEREO", { rate: 20, depth: 35, level: 60, preDelay: 5 });
clearOdds(ol1);
ns(ol1, 18, 40);
delay(ol1, "ANALOG", 400, 30, 48, "FLAT");
reverb(ol1, "SHIMMER", 4.0, 55, 25, -3, 5, 100, true, { pitch: 12 });
patches.push(ol1);

// DTMF-1  Warm — FX1 (Compressor) → AMP → NS → DELAY → REVERB
const dtmf1 = basePatch("DTMF-1 WARM");
amp(dtmf1, "DELUXE", 14, 58, 52, 50, '1x12"', "RIBON121");
fx(dtmf1, "fx1", "COMPRESSOR", "ORANGE", { sustain: 35, attack: 65, level: 55 });
clearOdds(dtmf1);
ns(dtmf1, 20, 40);
delay(dtmf1, "ANALOG", 360, 22, 38, "2kHz");
reverb(dtmf1, "HALL M", 3.0, 42, 30, -12, 4, 100);
patches.push(dtmf1);

// DTMF-2  Lo-Fi — FX1 (Enhancer) → AMP → FX2 (High GEQ) → NS → DELAY → REVERB
const dtmf2 = basePatch("DTMF-2 LOFI", CHAIN_FX2_AFTER_AMP);
amp(dtmf2, "TRNSPRNT", 8, 58, 52, 50, '1x12"', "RIBON121");
fx(dtmf2, "fx1", "ENHANCER", null, { sens: 65, level: 58, low: 0, lowFreq: 0, high: 0, highFreq: 0 });
fx(dtmf2, "fx2", "HIGH GEQ", null, { "250Hz": 4, "500Hz": 2, "1kHz": 3, "2kHz": -3, "4kHz": -6, "8kHz": 0, level: 20 });
clearOdds(dtmf2);
ns(dtmf2, 20, 40);
delay(dtmf2, "ANALOG", 360, 22, 38, "2kHz");
reverb(dtmf2, "HALL M", 3.0, 42, 30, -12, 4, 100);
patches.push(dtmf2);

// NEV-1  Neverita — FX1 (Compressor) → AMP → FX2 (Chorus) → NS → DELAY → REVERB
const nev1 = basePatch("NEV-1 NEVERIT", CHAIN_FX2_AFTER_AMP);
amp(nev1, "TWIN", 16, 50, 42, 65, "ORIGINAL", "CND87");
fx(nev1, "fx1", "COMPRESSOR", "BOSS COMP", { sustain: 45, attack: 40, level: 60 });
fx(nev1, "fx2", "CHORUS", "STEREO", { rate: 10, depth: 20, level: 45, preDelay: 4 });
clearOdds(nev1);
ns(nev1, 22, 38);
delay(nev1, "STANDARD", 320, 18, 35, "4kHz");
reverb(nev1, "HALL S", 2.2, 38, 15, -3, 5, 100);
patches.push(nev1);

// MM-1  Moscow Mule — FX1 (Compressor) → OD/DS → AMP → NS → DELAY → REVERB
const mm1 = basePatch("MM-1 MOSCOW", CHAIN_OD_BEFORE_FX1);
amp(mm1, "BOUTIQUE", 38, 52, 58, 65, '2x12"', "DYN57");
fx(mm1, "fx1", "COMPRESSOR", "BOSS COMP", { sustain: 55, attack: 30, level: 62 });
odds(mm1, "BLUES OD", 18, 8, 65);
ns(mm1, 40, 25);
delay(mm1, "STANDARD", 280, 20, 38, "FLAT");
reverb(mm1, "ROOM S", 1.4, 28, 8, 3, 6, 100);
patches.push(mm1);

// PDC-1  Pitorro de Coco — FX1 (Compressor) → AMP → NS → DELAY → REVERB
const pdc1 = basePatch("PDC-1 PITORRO");
amp(pdc1, "TRNSPRNT", 10, 45, 65, 58, "ORIGINAL", "CND451");
fx(pdc1, "fx1", "COMPRESSOR", "ORANGE", { sustain: 30, attack: 70, level: 55 });
clearOdds(pdc1);
ns(pdc1, 20, 50);
delay(pdc1, "ANALOG", 240, 15, 28, "2.5kHz");
reverb(pdc1, "ROOM S", 1.8, 32, 10, -5, 3, 100);
patches.push(pdc1);

// UC-1  Un Coco — FX1 (Compressor) → AMP → FX2 (Chorus) → NS → DELAY → REVERB
const uc1 = basePatch("UC-1 UN COCO", CHAIN_FX2_AFTER_AMP);
amp(uc1, "DELUXE", 20, 55, 50, 58, '1x12"', "RIBON121");
fx(uc1, "fx1", "COMPRESSOR", "BOSS COMP", { sustain: 48, attack: 45, level: 60 });
fx(uc1, "fx2", "CHORUS", "STEREO", { rate: 14, depth: 25, level: 50, preDelay: 5 });
clearOdds(uc1);
ns(uc1, 22, 45);
delay(uc1, "ANALOG", 420, 25, 40, "2.5kHz");
reverb(uc1, "HALL M", 2.8, 40, 20, -8, 5, 100);
patches.push(uc1);

// TUR-1  Turista — FX1 (Compressor) → AMP → NS → REVERB (no delay)
const tur1 = basePatch("TUR-1 TURISTA", CHAIN_REV_BEFORE_DLY);
amp(tur1, "TRNSPRNT", 8, 50, 58, 52, "ORIGINAL", "CND451");
fx(tur1, "fx1", "COMPRESSOR", "ORANGE", { sustain: 25, attack: 75, level: 52 });
clearOdds(tur1);
ns(tur1, 18, 55);
tur1.delay.on = false;
reverb(tur1, "ROOM S", 1.5, 28, 8, -3, 3, 100);
patches.push(tur1);

saveTsl(patches, "Bad Bunny", "examples/gx1/bad-bunny.tsl");
