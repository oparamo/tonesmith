import { gx1 } from "@tonesmith/core";
const { basePatch, amp, odds, clearOdds, fx, ns, delay, reverb, saveTsl, DEFAULT_CHAIN, moveBefore } = gx1;

// FX2 relocated to right after AMP, before NS.
const CHAIN_FX2_AFTER_AMP = moveBefore(DEFAULT_CHAIN, "FX2", "NS");
// OD/DS relocated to before FX1.
const CHAIN_OD_BEFORE_FX1 = moveBefore(DEFAULT_CHAIN, "OD/DS", "FX1");
// Both moves combined.
const CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP = moveBefore(CHAIN_OD_BEFORE_FX1, "FX2", "NS");

const patches = [];

// CN-1  Comfortably Numb Verse — FX1(Chorus) → AMP → FX2(Phaser) → NS → DLY → REV
const cn1 = basePatch("CN-1 VERSE", CHAIN_FX2_AFTER_AMP);
amp(cn1, "BRIT STACK", 18, 50, 48, 58, '4x12"', "RIBON121");
fx(cn1, "fx1", "CHORUS", "STEREO", { rate: 28, depth: 55, level: 70, preDelay: 4 });
fx(cn1, "fx2", "SCRIPT PH", null, { rate: 15, depth: 40, level: 55 });
clearOdds(cn1);
ns(cn1, 25, 35);
delay(cn1, "ANALOG", 480, 32, 45, "2.5kHz");
reverb(cn1, "HALL M", 3.5, 42, 30, -8, 5, 100);
patches.push(cn1);

// CN-2  Solo 1 — FX1(Comp) → OD(Muff) → AMP → NS → DLY → REV
const cn2 = basePatch("CN-2 SOLO1", CHAIN_OD_BEFORE_FX1);
amp(cn2, "BRIT STACK", 30, 52, 52, 60, '4x12"', "BLEND A");
fx(cn2, "fx1", "COMPRESSOR", "D-COMP", { sustain: 65, attack: 48, level: 60 });
odds(cn2, "MUFF FUZZ", 52, 10, 65);
ns(cn2, 38, 48);
delay(cn2, "ANALOG", 375, 28, 48, "3.15kHz");
reverb(cn2, "HALL S", 2.2, 36, 15, -3, 5, 100);
patches.push(cn2);

// CN-3  Solo 2 — FX1(Comp) → OD(Muff) → AMP → FX2(Chorus) → NS → DLY → REV
const cn3 = basePatch("CN-3 SOLO2", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(cn3, "BRIT STACK", 28, 52, 55, 60, '4x12"', "BLEND A");
fx(cn3, "fx1", "COMPRESSOR", "D-COMP", { sustain: 75, attack: 42, level: 63 });
odds(cn3, "MUFF FUZZ", 58, 15, 68);
fx(cn3, "fx2", "CHORUS", "STEREO", { rate: 18, depth: 22, level: 55, preDelay: 2 });
ns(cn3, 40, 55);
delay(cn3, "ANALOG", 390, 35, 55, "3.15kHz");
reverb(cn3, "HALL M", 3.2, 42, 20, -5, 6, 100);
patches.push(cn3);

// SOYCD-1  Four-Note Intro — FX1(Comp) → OD(Muff) → AMP → FX2(Phaser) → NS → DLY → REV
const soycd1 = basePatch("SOYCD-1 INTRO", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(soycd1, "BRIT STACK", 22, 50, 55, 55, '4x12"', "BLEND A");
fx(soycd1, "fx1", "COMPRESSOR", "D-COMP", { sustain: 85, attack: 30, level: 65 });
odds(soycd1, "MUFF FUZZ", 50, 0, 65);
fx(soycd1, "fx2", "SCRIPT PH", null, { rate: 12, depth: 60, level: 65 });
ns(soycd1, 20, 60);
delay(soycd1, "ANALOG", 550, 40, 58, "2kHz");
reverb(soycd1, "HALL M", 4.0, 45, 35, -12, 4, 100);
patches.push(soycd1);

// SOYCD-2  Clean Rhythm — FX1(Phaser) → AMP → FX2(Chorus) → NS → DLY → REV
const soycd2 = basePatch("SOYCD-2 RHYTH", CHAIN_FX2_AFTER_AMP);
amp(soycd2, "TWIN", 22, 53, 50, 63, "ORIGINAL", "CND87");
fx(soycd2, "fx1", "SCRIPT PH", null, { rate: 25, depth: 55, level: 68 });
fx(soycd2, "fx2", "CHORUS", "STEREO", { rate: 14, depth: 22, level: 48, preDelay: 3 });
clearOdds(soycd2);
ns(soycd2, 28, 38);
delay(soycd2, "ANALOG", 460, 28, 42, "2.5kHz");
reverb(soycd2, "HALL M", 2.8, 38, 22, -5, 5, 100);
patches.push(soycd2);

// SOYCD-3  Main Lead — FX1(Comp) → OD(Muff) → AMP → FX2(Phaser) → NS → DLY → REV
const soycd3 = basePatch("SOYCD-3 LEAD", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(soycd3, "BRIT STACK", 30, 52, 58, 60, '4x12"', "BLEND A");
fx(soycd3, "fx1", "COMPRESSOR", "D-COMP", { sustain: 70, attack: 45, level: 62 });
odds(soycd3, "MUFF FUZZ", 55, 8, 66);
fx(soycd3, "fx2", "SCRIPT PH", null, { rate: 20, depth: 45, level: 58 });
ns(soycd3, 35, 52);
delay(soycd3, "ANALOG", 500, 35, 52, "3.15kHz");
reverb(soycd3, "HALL M", 3.5, 40, 22, -5, 6, 100);
patches.push(soycd3);

// WYWH-1  Intro Fingerpicked — FX1(Comp) → AMP → FX2(Phaser) → NS → DLY → REV
const wywh1 = basePatch("WYWH-1 INTRO", CHAIN_FX2_AFTER_AMP);
amp(wywh1, "TWIN", 16, 48, 48, 58, "ORIGINAL", "RIBON121");
fx(wywh1, "fx1", "COMPRESSOR", "ORANGE", { sustain: 38, attack: 65, level: 55 });
fx(wywh1, "fx2", "SCRIPT PH", null, { rate: 18, depth: 48, level: 62 });
clearOdds(wywh1);
ns(wywh1, 25, 35);
delay(wywh1, "ANALOG", 420, 25, 38, "2.5kHz");
reverb(wywh1, "HALL M", 3.0, 35, 28, -8, 4, 100);
patches.push(wywh1);

// WYWH-2  Strummed Rhythm
const wywh2 = basePatch("WYWH-2 RHYTH", CHAIN_FX2_AFTER_AMP);
amp(wywh2, "TWIN", 20, 52, 50, 62, "ORIGINAL", "CND87");
fx(wywh2, "fx1", "COMPRESSOR", "ORANGE", { sustain: 45, attack: 50, level: 58 });
fx(wywh2, "fx2", "SCRIPT PH", null, { rate: 20, depth: 52, level: 65 });
clearOdds(wywh2);
ns(wywh2, 28, 40);
delay(wywh2, "ANALOG", 450, 30, 45, "2.5kHz");
reverb(wywh2, "HALL M", 2.8, 38, 22, -5, 5, 100);
patches.push(wywh2);

// WYWH-3  Outro Lead — FX1(Comp) → OD(Muff) → AMP → FX2(Phaser) → NS → DLY → REV
const wywh3 = basePatch("WYWH-3 LEAD", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(wywh3, "TWIN", 22, 52, 55, 60, "ORIGINAL", "BLEND A");
fx(wywh3, "fx1", "COMPRESSOR", "D-COMP", { sustain: 65, attack: 45, level: 60 });
odds(wywh3, "MUFF FUZZ", 48, 5, 62);
fx(wywh3, "fx2", "SCRIPT PH", null, { rate: 18, depth: 45, level: 60 });
ns(wywh3, 35, 50);
delay(wywh3, "ANALOG", 460, 33, 52, "3.15kHz");
reverb(wywh3, "HALL M", 3.0, 40, 18, -5, 6, 100);
patches.push(wywh3);

// HAC-1  Have A Cigar Rhythm — T-SCREAM boost, high gain
const hac1 = basePatch("HAC-1 RHYTHM", CHAIN_OD_BEFORE_FX1);
amp(hac1, "BRIT STACK", 55, 48, 62, 65, '4x12"', "DYN57");
fx(hac1, "fx1", "COMPRESSOR", "BOSS COMP", { sustain: 50, attack: 35, level: 60 });
odds(hac1, "T-SCREAM", 28, 12, 72);
ns(hac1, 45, 28);
delay(hac1, "ANALOG", 340, 22, 35, "3.15kHz");
reverb(hac1, "PLATE", 1.6, 28, 10, 5, 6, 100);
patches.push(hac1);

// HAC-2  Have A Cigar Lead — 60S FUZZ
const hac2 = basePatch("HAC-2 LEAD", CHAIN_OD_BEFORE_FX1);
amp(hac2, "BRIT STACK", 42, 50, 60, 68, '4x12"', "BLEND B");
fx(hac2, "fx1", "COMPRESSOR", "D-COMP", { sustain: 60, attack: 38, level: 62 });
odds(hac2, "60S FUZZ", 60, 18, 65);
ns(hac2, 42, 45);
delay(hac2, "ANALOG", 360, 28, 48, "3.15kHz");
reverb(hac2, "PLATE", 1.8, 35, 12, 5, 7, 100);
patches.push(hac2);

// HY-1  Hey You Rhythm — clean
const hy1 = basePatch("HY-1 RHYTHM", CHAIN_FX2_AFTER_AMP);
amp(hy1, "DELUXE", 15, 55, 50, 52, '1x12"', "RIBON121");
fx(hy1, "fx1", "COMPRESSOR", "ORANGE", { sustain: 40, attack: 60, level: 58 });
fx(hy1, "fx2", "CHORUS", "STEREO", { rate: 12, depth: 20, level: 50, preDelay: 3.5 });
clearOdds(hy1);
ns(hy1, 30, 40);
delay(hy1, "ANALOG", 460, 28, 42, "2.5kHz");
reverb(hy1, "HALL M", 2.8, 38, 25, -10, 5, 100);
patches.push(hy1);

// HY-2  Hey You Lead
const hy2 = basePatch("HY-2 LEAD", CHAIN_OD_BEFORE_FX1);
amp(hy2, "BRIT STACK", 28, 52, 55, 60, '4x12"', "BLEND A");
fx(hy2, "fx1", "COMPRESSOR", "D-COMP", { sustain: 72, attack: 45, level: 62 });
odds(hy2, "MUFF FUZZ", 58, 8, 68);
ns(hy2, 40, 55);
delay(hy2, "ANALOG", 480, 38, 55, "3.15kHz");
reverb(hy2, "HALL S", 3.2, 42, 20, -5, 6, 100);
patches.push(hy2);

// ABW-1  Another Brick Rhythm — T-SCREAM, very high gain
const abw1 = basePatch("ABW-1 RHYTHM", CHAIN_OD_BEFORE_FX1);
amp(abw1, "BRIT STACK", 60, 50, 40, 70, '4x12"', "DYN57");
fx(abw1, "fx1", "CHORUS", "STEREO", { rate: 30, depth: 40, level: 60, preDelay: 0 });
odds(abw1, "T-SCREAM", 20, 10, 70);
ns(abw1, 55, 30);
delay(abw1, "STANDARD", 320, 28, 45, "FLAT");
reverb(abw1, "PLATE", 1.8, 30, 0, 0, 5, 100);
patches.push(abw1);

// TD-1  Time/Dogs Lead — 60S FUZZ
const td1 = basePatch("TD-1 LEAD", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(td1, "BRIT STACK", 50, 55, 55, 65, '4x12"', "BLEND B");
fx(td1, "fx1", "COMPRESSOR", "D-COMP", { sustain: 60, attack: 45, level: 60 });
odds(td1, "60S FUZZ", 65, 5, 60);
fx(td1, "fx2", "VIBRATO", null, { rate: 40, depth: 35, level: 100, riseTime: 0, trigger: 0 });
ns(td1, 35, 45);
delay(td1, "ANALOG", 440, 32, 50, "3.15kHz");
reverb(td1, "HALL S", 2.0, 38, 15, 0, 5, 100);
patches.push(td1);

// ECH-1  Echoes Clean Verse
const ech1 = basePatch("ECH-1 CLEAN", CHAIN_FX2_AFTER_AMP);
amp(ech1, "BRIT STACK", 20, 52, 45, 65, '4x12"', "DYN421");
fx(ech1, "fx1", "CHORUS", "STEREO", { rate: 22, depth: 45, level: 65, preDelay: 3 });
fx(ech1, "fx2", "SCRIPT PH", null, { rate: 16, depth: 38, level: 52 });
clearOdds(ech1);
ns(ech1, 30, 38);
delay(ech1, "ANALOG", 430, 30, 45, "2.5kHz");
reverb(ech1, "HALL S", 2.5, 36, 18, -5, 5, 100);
patches.push(ech1);

// ECH-2  Echoes Chaos — extreme settings
const ech2 = basePatch("ECH-2 CHAOS", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(ech2, "BRIT STACK", 75, 45, 65, 70, '4x12"', "DYN57");
fx(ech2, "fx1", "FLANGER", null, { rate: 8, depth: 80, manual: 55, reso: 70, level: 75 });
odds(ech2, "LEAD DS", 80, 5, 65);
fx(ech2, "fx2", "PHASER", null, { stage: 12, rate: 10, depth: 80, reso: 65, manual: 50, level: 70 });
ns(ech2, 0, 0, false);
delay(ech2, "ANALOG", 680, 55, 65, "4kHz");
reverb(ech2, "HALL S", 4.5, 55, 10, 5, 8, 100);
patches.push(ech2);

// ECH-3  Echoes Main Lead — 60S FUZZ
const ech3 = basePatch("ECH-3 LEAD", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(ech3, "BRIT STACK", 35, 53, 55, 62, '4x12"', "BLEND B");
fx(ech3, "fx1", "COMPRESSOR", "D-COMP", { sustain: 65, attack: 45, level: 60 });
odds(ech3, "60S FUZZ", 62, 10, 65);
fx(ech3, "fx2", "CHORUS", "STEREO", { rate: 18, depth: 28, level: 52, preDelay: 2 });
ns(ech3, 36, 48);
delay(ech3, "ANALOG", 450, 32, 50, "3.15kHz");
reverb(ech3, "HALL S", 2.8, 38, 16, -3, 5, 100);
patches.push(ech3);

// BRE-1  Breathe Rhythm
const bre1 = basePatch("BRE-1 RHYTHM", CHAIN_FX2_AFTER_AMP);
amp(bre1, "DELUXE", 18, 55, 48, 55, '1x12"', "RIBON121");
fx(bre1, "fx1", "TREMOLO", null, { rate: 35, depth: 45, level: 70 });
fx(bre1, "fx2", "CHORUS", "STEREO", { rate: 16, depth: 48, level: 65, preDelay: 5 });
clearOdds(bre1);
ns(bre1, 28, 42);
delay(bre1, "ANALOG", 500, 30, 40, "2kHz");
reverb(bre1, "HALL M", 3.2, 40, 28, -10, 4, 100);
patches.push(bre1);

// BRE-2  Breathe Lead
const bre2 = basePatch("BRE-2 LEAD", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(bre2, "BRIT STACK", 32, 52, 60, 58, '4x12"', "BLEND A");
fx(bre2, "fx1", "COMPRESSOR", "D-COMP", { sustain: 68, attack: 45, level: 60 });
odds(bre2, "60S FUZZ", 55, 5, 63);
fx(bre2, "fx2", "CHORUS", "STEREO", { rate: 16, depth: 25, level: 50, preDelay: 2 });
ns(bre2, 35, 48);
delay(bre2, "ANALOG", 460, 30, 48, "3.15kHz");
reverb(bre2, "HALL M", 3.0, 38, 18, -5, 5, 100);
patches.push(bre2);

// MAR-1  Marooned Slide Rhythm — MODULATE delay, SHIMMER reverb
const mar1 = basePatch("MAR-1 RHYTH", CHAIN_FX2_AFTER_AMP);
amp(mar1, "TWIN", 16, 50, 52, 60, "ORIGINAL", "CND87");
fx(mar1, "fx1", "CHORUS", "STEREO", { rate: 14, depth: 38, level: 60, preDelay: 4 });
fx(mar1, "fx2", "TREMOLO", null, { rate: 22, depth: 30, level: 65 });
clearOdds(mar1);
ns(mar1, 22, 65);
delay(mar1, "MODULATE", 580, 38, 50, "2.5kHz", true, { modRate: 12, modDepth: 18 });
reverb(mar1, "SHIMMER", 4.0, 48, 30, -5, 5, 100, true, { pitch: 12, pitchLvl: 25 });
patches.push(mar1);

// MAR-2  Marooned Main Slide Lead
const mar2 = basePatch("MAR-2 LEAD", CHAIN_OD_BEFORE_FX1_FX2_AFTER_AMP);
amp(mar2, "BRIT STACK", 25, 53, 58, 60, '4x12"', "BLEND A");
fx(mar2, "fx1", "COMPRESSOR", "D-COMP", { sustain: 80, attack: 35, level: 65 });
odds(mar2, "MUFF FUZZ", 45, 3, 65);
fx(mar2, "fx2", "CHORUS", "STEREO", { rate: 16, depth: 30, level: 55, preDelay: 3 });
ns(mar2, 28, 60);
delay(mar2, "MODULATE", 520, 40, 55, "3.15kHz", true, { modRate: 10, modDepth: 15 });
reverb(mar2, "SHIMMER", 4.5, 45, 20, -3, 5, 100, true, { pitch: 12, pitchLvl: 30 });
patches.push(mar2);

saveTsl(patches, "Gilmour", "examples/gx1/gilmour.tsl");
