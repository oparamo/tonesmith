---
"@tonesmith/core": patch
---

Correct the GX-1 codec against the device's own parameter data. Each of these decoded or encoded a
value the hardware does not use.

- **`MEMORY%CHAIN`**, the signal chain, is a linked list in which each block's slot names its
  successor, and it was being encoded as though it were a plain ordered list.
- **OD/DS's type selector** was read from the wrong byte.
- **FEEDBACKER `MODE`** decoded as `PITCH / BRUSH / SCREEM`; the device's two modes are
  `NORMAL / OSC`. A real FEEDBACKER patch reported mode 0 as `"PITCH"` where the device means
  `"NORMAL"`, and `"SCREEM"` named an index the device never produces.
- **HUMANIZER `VOWEL1`/`VOWEL2`** carried ten entries (`a,e,i,o,u,A,E,I,O,U`) against the device's
  five. The uppercase half were phantom values.
- **PHASER `stage`** was modeled with a bespoke formula (`raw*2+2` decoding, `(value-2)>>1`
  encoding) while the catalog declared it a `4 STAGE`/`8 STAGE`/`12 STAGE` enum, so passing the
  documented string produced `NaN` and wrote a garbage byte. The formula was wrong on its own terms
  too, decoding byte 0 to a nonsensical `2`. It is a plain contiguous enum now.
- **SHIMMER reverb** homed its `LEVEL` to byte 10 and left `PITCH LVL` unmodeled. It shares the
  standard `LEVEL` byte with the other reverb types, and byte 10 is `PITCH LVL`.
- **PARA. EQ, PITCH SHIFT and HARMONIST value tables** were corrected against the parameter guide.
- **Type enums that had borrowed another block's values**: FX-slot DELAY types are their own set
  (STANDARD/MODULATE/WARP/TWIST/GLITCH), FX-slot REVERB types are their own set (HALL S/HALL
  M/PLATE/ROOM/STUDIO), and the dedicated DLY block's TWIST `MODE` is RISE-FALL/RISE-FADE.

Round trip stays byte identical. The codec preserves the raw byte behind each of these, and no
committed patch used a phantom value.

Three guards keep the class from returning. A codec-to-catalog parity test checks every per-type
param's name against the codec's field map. An enum-value test asserts each discrete lookup table
equals its catalog `range` verbatim, which is the entry-count check a name-only guard cannot
perform. And a representation-parity test asserts each param's domain kind matches its codec
field's kind, so a catalog enum backed by a mistyped field fails the suite rather than shipping.
