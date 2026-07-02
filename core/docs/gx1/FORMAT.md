# GX-1 TSL File Format

Reverse-engineered format for BOSS GX-1 `.tsl` patch files, built by studying real `.tsl` exports from the device alongside the BOSS Tone Studio app. All byte values are stored as hex strings in a JSON array (e.g. `["01","2A","FF"]`).

## TSL JSON Envelope

```json
{
  "name":      "Rock Tones",     // set name
  "formatRev": "0000",           // always "0000"
  "device":    "GX-1",
  "data": [
    [ <patch>, <patch>, ... ],   // data[0] = user patches (up to 99)
    [ ... ]                      // data[1] = preset patches (read-only)
  ]
}
```

Each patch:

```json
{
  "memo":     "",          // user memo string
  "paramSet": { ... }      // all parameter blocks
}
```

## paramSet Block Inventory

| Key                | Len | Description                               |
|--------------------|-----|-------------------------------------------|
| `MEMORY%COM`       |  16 | Patch name (ASCII, space-padded)          |
| `MEMORY%CHAIN`     |  13 | Signal chain, linked list (11 bytes used) |
| `MEMORY%FX1_COM`   |   3 | FX1 on/off + type header                  |
| `MEMORY%FX1`       | 251 | FX1 parameter block                       |
| `MEMORY%FX2_COM`   |   3 | FX2 on/off + type header                  |
| `MEMORY%FX2`       | 251 | FX2 parameter block                       |
| `MEMORY%FX3_COM`   |   3 | FX3 on/off + type header                  |
| `MEMORY%FX3`       | 251 | FX3 parameter block                       |
| `MEMORY%FX3A`      |   5 | FX3 OVERTONE parameters                   |
| `MEMORY%ODDS`      |   8 | OD/DS block (drive, tone, level…)         |
| `MEMORY%AMP`       |  13 | Amp/cab settings                          |
| `MEMORY%DLY`       |  29 | Delay settings                            |
| `MEMORY%REV`       |  20 | Reverb settings                           |
| `MEMORY%PFX`       |  14 | Pedal FX (WAH / PEDAL BEND)               |
| `MEMORY%FV`        |   4 | Foot volume                               |
| `MEMORY%NS`        |   4 | Noise suppressor                          |
| `MEMORY%OTHER`     |   7 | Master (BPM, key, carryover, etc.)        |
| `MEMORY%CTL`       |  32 | CTL footswitch assignments                |
| `MEMORY%ASGN1`–`8` |  15 | Expression/assign slots                   |

## MEMORY%COM — Patch Name (16 bytes)

ASCII bytes, right-padded with spaces (0x20).

## MEMORY%CHAIN — Signal Chain (13 bytes, 11 used)

Not a positional array — a linked list. Byte 0 holds the firmware value of whichever
block comes first (`item_top`). Each of bytes 1–10 holds the firmware value of whatever
comes immediately *after* one specific fixed block, indexed by that block's own slot
below — not by chain position. A firmware value of 0 means "connects to OUTPUT", a fixed
endpoint that is never itself reordered and has no slot of its own. Bytes 11–12 are
unused by this scheme (always 11, 12 on a real device; preserved on encode, not written).

| Firmware value | Block  |
|-----|--------|
|   0 | OUTPUT (terminator only, never a `next`-slot source) |
|   1 | PFX    |
|   2 | FX1    |
|   3 | OD/DS  |
|   4 | AMP    |
|   5 | FX2    |
|   6 | FX3    |
|   7 | NS     |
|   8 | FV     |
|   9 | DLY    |
|  10 | REV    |

| Byte | Holds the firmware value of what follows... |
|------|----------------------------------------------|
|    0 | *(nothing — this is `item_top`, the first block)* |
|    1 | PFX    |
|    2 | FX1    |
|    3 | OD/DS  |
|    4 | AMP    |
|    5 | FX2    |
|    6 | FX3    |
|    7 | NS     |
|    8 | FV     |
|    9 | DLY    |
|   10 | REV    |

Example (untouched default order `PFX→FX1→OD/DS→AMP→NS→FV→FX2→FX3→DLY→REV`):
`[1,2,3,4,7,6,9,8,5,10,0,11,12]` — byte 0 (`item_top`) is 1 (PFX); byte 1 (PFX's next) is
2 (FX1); byte 4 (AMP's next) is 7 (NS); byte 10 (REV's next) is 0 (OUTPUT, end of chain).

## MEMORY%FX1_COM / FX2_COM / FX3_COM (3 bytes)

| Byte | Field   | Notes                                      |
|------|---------|--------------------------------------------|
|    0 | on      | 0=OFF, 1=ON                                |
|    1 | fx_type | Index into FX_TYPES list (see below)       |
|    2 | fx_type_bass | Bass-mode mirror of byte 1 — not used in guitar mode, always preserved |

Byte 2 is never a subtype for any effect type. COMPRESSOR, LIMITER, AC RESO, CHORUS,
CLASSIC-VIBE, HUMANIZER, and OD/DS each store their own sub-model selector as the
first byte of their own region in the FX parameter block below (see PARAM_SUBTYPE_EFFECTS
in `common/constants.ts`), not in FX_COM.

**FX_TYPES index table** (byte 1 value → effect name):

| Idx | Name         | Idx | Name         | Idx | Name        |
|-----|--------------|-----|--------------|-----|-------------|
|   0 | COMPRESSOR   |  13 | PARA. EQ     |  26 | PAN         |
|   1 | LIMITER      |  14 | GEQ          |  27 | RING MOD    |
|   2 | ENHANCER     |  15 | LOW GEQ      |  28 | HUMANIZER   |
|   3 | TOUCH WAH    |  16 | HIGH GEQ     |  29 | PITCH SHIFT |
|   4 | AUTO WAH     |  17 | CHORUS       |  30 | HARMONIST   |
|   5 | FIXED WAH    |  18 | FLANGER      |  31 | OCTAVE      |
|   6 | DEFRETTER    |  19 | PHASER       |  32 | HEAVY OCT   |
|   7 | SLOW GEAR    |  20 | SCRIPT PH    |  33 | S-BEND      |
|   8 | AC. GTR SIM  |  21 | CLASSIC-VIBE |  34 | PEDAL BEND  |
|   9 | AC RESO      |  22 | ROTARY       |  35 | TUNE DOWN   |
|  10 | SITAR SIM    |  23 | VIBRATO      |  36 | DELAY       |
|  11 | FEEDBACKER   |  24 | TREMOLO      |  37 | REVERB      |
|  12 | OD/DS        |  25 | SLICER       |  38 | OVERTONE*  |

*OVERTONE (38) is FX3 only. Its parameters are in `MEMORY%FX3A`, not `MEMORY%FX3`.

**OD/DS pedal-model table** (param-block byte at the start of OD/DS's own region — see below):

| 0 MID BOOST | 1 CLEAN BST | 2 TREBLE BST | 3 NATURAL OD | 4 WARM OD |
| 5 BLUES OD | 6 OVERDRIVE | 7 CRUNCH | 8 T-SCREAM | 9 TURBO OD |
| 10 CENTA OD | 11 X-OD | 12 DIST | 13 A-DIST | 14 FAT DS |
| 15 LEAD DS | 16 RAT | 17 GUV DS | 18 DIST+ | 19 X-DIST |
| 20 METAL DS | 21 METAL ZONE | 22 HVY METAL | 23 METAL CORE | 24 OCT FUZZ |
| 25 60S FUZZ | 26 MUFF FUZZ | 27 BASS OD | 28 X-BASS OD | 29 BASS DS |
| 30 BASS DI | 31 SA DI DRIVE | 32 HI BAND DRV | 33 BASS MT | 34 BASS FUZZ |

## MEMORY%FX1 / FX2 / FX3 — FX Parameter Block (251 bytes)

Only the first N bytes are used per effect type; the rest are preserved verbatim.
Signed values use `raw - 50` (centre=50) unless noted. "→" means stored as raw byte.

### Encoding conventions

| Convention | Formula |
|---|---|
| Signed (centre 50) | `display = raw - 50` → range -50..+50 |
| Signed (centre 20) | `display = raw - 20` → range -20..+20 (EQ gains) |
| Signed (centre 24) | `display = raw - 24` → range -24..+24 (pitch semitones) |
| Signed (centre 12) | `display = raw - 12` → range -12..0 (TUNE DOWN) |
| 16-bit time (4-nibble) | one hex digit per byte across 4 consecutive bytes, MSB first |
| 8-bit value (2-nibble) | one hex digit per byte across 2 consecutive bytes, MSB first (reverb pre-delay) |

### Per-effect byte maps

Each entry below gives the **absolute byte offset within the 251-byte block** where
that effect type's own parameters start (not an offset relative to 0). Effects are
laid out back-to-back in a fixed order — there is no padding between them beyond
what's noted.

**COMPRESSOR** — starts at byte 0; p[0..3]
`p[0]`=type (0=BOSS COMP,1=D-COMP,2=ORANGE,3=X-COMP,4=STEREO) `p[1]`=sustain `p[2]`=attack `p[3]`=level

**LIMITER** — starts at byte 10; p[0..5]
`p[0]`=type (0=BOSS,1=RACK 160D,2=VTG RACK U) `p[1]`=threshold `p[2]`=ratio `p[3]`=level `p[4]`=attack `p[5]`=release

**SLOW GEAR** — starts at byte 16; p[0..2]
`p[0]`=sens `p[1]`=rise_time `p[2]`=level

**ENHANCER** — starts at byte 19; p[0..5]
`p[0]`=sens `p[1]`=low `p[2]`=high `p[3]`=low_freq `p[4]`=high_freq `p[5]`=level

**SLICER** — starts at byte 25; p[0..5]
`p[0]`=pattern (0–19 = PATTERN 1–20) `p[1]`=rate `p[2]`=level `p[3]`=attack `p[4]`=duty (signed, centre=-1: display=raw+1) `p[5]`=direct

**PARA. EQ** — starts at byte 31; p[0..6]  *(EQ gains use centre=20)*
`p[0]`=lowGain (signed20) `p[1]`=highGain (signed20) `p[2]`=level (signed20) `p[3]`=midFreq `p[4]`=midGain (signed20) `p[5]`=lowCut (see `LOW_CUT_MAP`, `builder.ts`) `p[6]`=highCut (see `HIGH_CUT_MAP`)

**GEQ** — starts at byte 38; p[0..6]
`p[0..5]`=bands 125Hz/250Hz/500Hz/1kHz/2kHz/4kHz (signed20) `p[6]`=level (signed20)

**LOW GEQ** — starts at byte 45; p[0..6]
`p[0..5]`=bands 63Hz/125Hz/250Hz/500Hz/1kHz/2kHz (signed20) `p[6]`=level (signed20)

**HIGH GEQ** — starts at byte 52; p[0..6]
`p[0..5]`=bands 250Hz/500Hz/1kHz/2kHz/4kHz/8kHz (signed20) `p[6]`=level (signed20)

**TOUCH WAH** — starts at byte 59; p[0..7]
`p[0]`=filter (0=LPF,1=BPF,2=HPF) `p[1]`=polarity (0=DOWN,1=UP) `p[2]`=sens `p[3]`=freq `p[4]`=reso `p[5]`=decay `p[6]`=level `p[7]`=direct

**AUTO WAH** — starts at byte 67; p[0..5]
`p[0]`=filter (0=LPF,1=BPF,2=HPF) `p[1]`=freq `p[2]`=rate `p[3]`=depth `p[4]`=reso `p[5]`=level

**DEFRETTER** — starts at byte 73; p[0..6]
`p[0]`=sens `p[1]`=attack `p[2]`=depth `p[3]`=reso `p[4]`=tone (signed50) `p[5]`=level `p[6]`=direct

**FIXED WAH** — starts at byte 85; p[0], p[2..4]  *(p[1] is the bass-mode wah type — not used in guitar mode)*
`p[0]`=wah_type (0=CRY WAH,1=VO WAH,2=FAT WAH,3=LIGHT WAH,4=7STR WAH,5=RESO WAH) `p[2]`=level `p[3]`=direct `p[4]`=manual

**AC. GTR SIM** — starts at byte 93; p[0..3]
`p[0]`=high (signed50) `p[1]`=body `p[2]`=low (signed50) `p[3]`=level

**AC RESO** — starts at byte 97; p[0..3]
`p[0]`=type (0=NATURAL,1=WIDE,2=BRIGHT) `p[1]`=reso `p[2]`=tone (signed50) `p[3]`=level

**FEEDBACKER** — starts at byte 101; p[0..6]
`p[0]`=mode (0=PITCH,1=BRUSH,2=SCREEM) `p[1]`=trigger `p[2]`=depth `p[3]`=rise_time `p[4]`=oct_rise_tm `p[5]`=feedback `p[6]`=oct_feedback

**SITAR SIM** — starts at byte 108; p[0..6]
`p[0]`=sens `p[1]`=depth `p[2]`=tone (signed50) `p[3]`=level `p[4]`=reso `p[5]`=buzz `p[6]`=direct

**OD/DS** — starts at byte 115; p[0..4]  *(p[0]=type, stored here like COMPRESSOR/LIMITER/etc. — not in FX_COM byte 2)*
`p[0]`=type (see pedal-model table above) `p[1]`=drive `p[2]`=tone (signed50) `p[3]`=level `p[4]`=direct

**CHORUS** — starts at byte 122; p[0..5]
`p[0]`=type (0=MONO,1=DIR/EFX,2=STEREO) `p[1]`=rate `p[2]`=depth `p[3]`=level `p[4]`=pre_delay (raw × 0.5ms) `p[5]`=direct

**FLANGER** — starts at byte 128; p[0..5]
`p[0]`=rate `p[1]`=depth `p[2]`=reso `p[3]`=manual `p[4]`=level `p[5]`=direct

**PHASER** — starts at byte 134; p[0..6]
`p[0]`=stage_raw (display=raw*2+2, so 0=4stage,1=8stage,2=12stage) `p[1]`=rate `p[2]`=depth `p[3]`=reso `p[4]`=manual `p[5]`=level `p[6]`=direct

**SCRIPT PH** — starts at byte 141; p[0..2]
`p[0]`=rate `p[1]`=depth `p[2]`=level

**CLASSIC-VIBE** — starts at byte 144; p[0..3]
`p[0]`=mode (0=CHORUS,1=VIBRATO) `p[1]`=rate `p[2]`=depth `p[3]`=level

**ROTARY** — starts at byte 148; p[0..6]
`p[0]`=speed (0=SLOW,1=FAST) `p[1]`=slow_rate `p[2]`=fast_rate `p[3]`=level `p[4]`=balance `p[5]`=drive `p[6]`=direct

**VIBRATO** — starts at byte 155; p[0..4]
`p[0]`=rate `p[1]`=depth `p[2]`=rise_time `p[3]`=trigger `p[4]`=level

**TREMOLO** — starts at byte 160; p[0..2]
`p[0]`=rate `p[1]`=depth `p[2]`=level

**PAN** — starts at byte 163; p[0..2]
`p[0]`=rate `p[1]`=depth `p[2]`=level

**RING MOD** — starts at byte 166; p[0..5]
`p[0]`=intelligent (0=OFF,1=ON) `p[1]`=freq `p[2]`=mod_rate `p[3]`=mod_depth `p[4]`=level `p[5]`=direct

**HUMANIZER** — starts at byte 172; p[0..6]
`p[0]`=mode (0=PICKING,1=AUTO) `p[1]`=vowel1 `p[2]`=vowel2 (0–9 = a,e,i,o,u,A,E,I,O,U) `p[3]`=sens `p[4]`=rate `p[5]`=manual `p[6]`=level

**PITCH SHIFT** — starts at byte 179; p[0..8]  *(pre_delay is 16-bit, not a plain byte)*
`p[0]`=mode (0=FAST,1=MEDIUM,2=SLOW,3=MONO) `p[1]`=pitch — index into a 51-entry table: 0="+7&-5", 1–49 → semitones -24..+24 (index-25), 50="+12&-5" `p[2..5]`=pre_delay (16-bit) `p[6]`=level `p[7]`=feedback `p[8]`=direct

**HARMONIST** — starts at byte 188; p[0..7]  *(pre_delay is 16-bit; there is no separate "key" byte)*
`p[0]`=harmony — raw index (0–32) into the 33-entry `HARMONIST_HR` table (`common/constants.ts`): 0="+1oct&-1oct", 1="-4th&-6th", 2="-2oct", 3–8="-14th".."-9th", 9="-1oct", 10–15="-7th".."-2nd", 16="UNISON", 17–22="+2nd".."+7th", 23="+1oct", 24–29="+9th".."+14th", 30="+2oct", 31="+3rd&+5th", 32="+3rd&-4th" `p[1..4]`=pre_delay (16-bit) `p[5]`=level `p[6]`=feedback `p[7]`=direct

**OCTAVE** — starts at byte 196; p[0..2]
`p[0]`=minus1_oct `p[1]`=minus2_oct `p[2]`=direct

**HEAVY OCT** — starts at byte 199; p[0..2]  *(same layout as OCTAVE)*
`p[0]`=minus1_oct `p[1]`=minus2_oct `p[2]`=direct

**S-BEND** — starts at byte 202; p[0..3]
`p[0]`=trigger `p[1]`=pitch (0–6 = -3oct..-1oct,+1oct..+4oct) `p[2]`=rise_time `p[3]`=fall_time

**PEDAL BEND** — starts at byte 206; p[0..4]
`p[0]`=pitch_min (signed24) `p[1]`=pitch_max (signed24) `p[2]`=pdl_pos `p[3]`=level `p[4]`=direct

**TUNE DOWN** — starts at byte 211; p[0]
`p[0]`=pitch (signed12: raw-12, range -12..0 semitones)

**DELAY** *(when FX slot type=DELAY)* — starts at byte 212; p[0..9]  *(only STANDARD/MODULATE/PAN/REVERSE/ANALOG are reachable — WARP/TWIST/GLITCH are dedicated-DLY-block-only)*
`p[0]`=dly_type (0..4) `p[1..4]`=time (16-bit) `p[5]`=feedback `p[6]`=level `p[7]`=high_cut `p[8]`=mod_rate `p[9]`=mod_depth, plus `p[11]`=trigger (0=OFF,1=ON, used by REVERSE)

**REVERB** *(when FX slot type=REVERB)* — starts at byte 231; p[0..5]  *(only HALL S/HALL M/PLATE/ROOM S/ROOM L are reachable)*
`p[0]`=rev_type index (0..4) `p[1]`=time_s (raw × 0.1) `p[2..3]`=pre_delay_ms (8-bit) `p[4]`=level `p[5]`=direct

**OVERTONE** *(FX3 only — stored in MEMORY%FX3A, not MEMORY%FX3)* — p[0..4]
`p[0]`=lower `p[1]`=upper `p[2]`=unison `p[3]`=direct `p[4]`=detune

## MEMORY%AMP (13 bytes)

| Byte | Field   | Notes |
|------|---------|-------|
| 0    | on      | 0=OFF, 1=ON |
| 1    | type    | AMP_TYPES index (0–22) |
| 2    | type_bass | bass-mode amp type — not used in guitar mode, preserved |
| 3    | gain    | 0–120 |
| 4    | level   | 0–100 |
| 5    | bass    | 0–100 |
| 6    | middle  | 0–100 |
| 7    | treble  | 0–100 |
| 8    | speaker | SP_TYPES index (0=OFF,1=ORIGINAL,2–8=cabinet sizes,9–16=USER1–8) |
| 9    | sp_type_bass | bass-mode speaker type — not used in guitar mode, preserved |
| 10   | mic     | MIC_TYPES index (0=DYN57…8=BLEND C) |
| 11   | solo_sw | not modeled, preserved |
| 12   | solo_level | not modeled, preserved |

## MEMORY%NS — Noise Suppressor (4 bytes)

| Byte | Field     | Notes |
|------|-----------|-------|
| 0    | on        | 0=OFF, 1=ON |
| 1    | threshold | 0–100 |
| 2    | release   | 0–100 |
| 3    | detect    | 0=INPUT, 1=NS INPUT |

## MEMORY%FV — Foot Volume (4 bytes)

| Byte | Field    | Notes |
|------|----------|-------|
| 0    | position | 0–100 |
| 1    | min      | 0–100 |
| 2    | max      | 0–100 |
| 3    | curve    | 0=SLOW1,1=SLOW2,2=NORMAL,3=FAST |

## MEMORY%DLY — Delay (29 bytes)

| Byte | Field  | Notes |
|------|--------|-------|
| 0    | on     | 0=OFF, 1=ON |
| 1    | type   | DLY_TYPES index (see below) |
| 2+   | params | See table below — absolute byte offsets, several shared across types |

DLY_TYPES: 0=STANDARD, 1=MODULATE, 2=PAN, 3=REVERSE, 4=ANALOG, 5=ANLG MOD, 6=SPACE ECHO, 7=SHIMMER, 8=WARP, 9=TWIST, 10=GLITCH

Byte offsets are absolute (not relative to a per-type sub-block). Several fields are
shared across types at the same address rather than each type getting its own
compact layout — e.g. `feedback`/`level`/`high_cut` at 6/7/8 are used by every
"clean" delay type, and `trigger`/`level` at 21/25 are shared by WARP, TWIST, and
GLITCH.

| Byte(s) | Field | Used by |
|---------|-------|---------|
| 2–5 | time (16-bit, 4 hex-digit nibbles, MSB first) | STANDARD, MODULATE, PAN, REVERSE, ANLG MOD, SPACE ECHO, SHIMMER, WARP |
| 6 | feedback | STANDARD, MODULATE, PAN, REVERSE, ANALOG, ANLG MOD, SPACE ECHO, SHIMMER |
| 7 | level | same set as feedback |
| 8 | high_cut | same set as feedback |
| 9 | mod_rate | MODULATE, ANLG MOD |
| 10 | mod_depth | MODULATE, ANLG MOD |
| 11 | tap_time | PAN |
| 12 | trigger (auto-trigger) | REVERSE |
| 13–16 | time (16-bit, own field) | ANALOG |
| 17 | head | SPACE ECHO |
| 18 | pitch (signed24) | SHIMMER |
| 19 | balance | SHIMMER |
| 20 | mode (0=TAPE,1=TAPE-ECH,2=REVERSE) | TWIST |
| 21 | trigger | WARP, TWIST, GLITCH |
| 22 | rise_time | TWIST |
| 23 | fall_time | TWIST |
| 24 | fade_time | TWIST |
| 25 | level | WARP, TWIST |
| 26 | time (1 byte, own field) | GLITCH |
| 27 | glitch | GLITCH |
| 28 | balance | GLITCH |

## MEMORY%REV — Reverb (20 bytes)

| Byte | Field | Notes |
|------|-------|-------|
| 0    | on    | 0=OFF, 1=ON |
| 1    | type  | REV_TYPES index (see below) |
| 2+   | params | See table below — absolute byte offsets, several shared across types |

REV_TYPES: 0=HALL S, 1=HALL M, 2=PLATE, 3=ROOM S, 4=ROOM L, 5=AMBIENCE, 6=SPRING, 7=SHIMMER, 8=SUB DELAY, 9=TERA ECHO

As with MEMORY%DLY, several fields are shared across types at the same address
(`tone` at 3, `level` at 5, `direct` at 8, `pre_delay` at 6, `feedback` at 16).

| Byte(s) | Field | Used by |
|---------|-------|---------|
| 2 | time (raw × 0.1) | HALL S/M, PLATE, ROOM S/L, AMBIENCE, SPRING, SHIMMER |
| 3 | tone (signed50) | HALL S/M, PLATE, ROOM S/L, AMBIENCE, SPRING, SHIMMER, TERA ECHO |
| 4 | density (raw+1) | HALL S/M, PLATE, ROOM S/L, AMBIENCE, SPRING |
| 5 | level | HALL S/M, PLATE, ROOM S/L, AMBIENCE, SPRING, TERA ECHO |
| 6–7 | pre_delay_ms (8-bit, 2 hex-digit nibbles) | HALL S/M, PLATE, ROOM S/L, AMBIENCE, SPRING, SHIMMER |
| 8 | direct | HALL S/M, PLATE, ROOM S/L, AMBIENCE, SPRING, TERA ECHO |
| 9 | pitch (signed24) | SHIMMER |
| 10 | level (own field) | SHIMMER |
| 11–14 | time_ms (16-bit, own field) | SUB DELAY |
| 15 | level (own field) | SUB DELAY |
| 16 | feedback | SUB DELAY, TERA ECHO |
| 17 | high_cut | SUB DELAY |
| 18 | spread_time ("S-TIME") | TERA ECHO |
| 19 | trigger | TERA ECHO |

## MEMORY%OTHER (7 bytes)

Master block. Byte layout not fully decoded; known fields are inferred from context (BPM, key, carryover). Preserved verbatim on write.

## Unknown / Unimplemented Blocks

`MEMORY%PFX`, `MEMORY%CTL`, `MEMORY%ASGN1`–`8` are read and preserved verbatim. Their internal structure has not been reverse-engineered.


