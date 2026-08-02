---
"@tonesmith/core": major
"@tonesmith/cli": major
"@tonesmith/mcp": major
---

The decoded GX-1 patch has one consistent shape, and it is not the 0.2.0 shape.

**Field names are camelCase**, matching the rest of the decoded object rather than the manual's
display names: `preDelay`, `highCut`, `subType`, `octFeedback`, and so on throughout.
`describe_device` reports each param's `key`, so the name to write is always available without
guessing how a display name was transliterated.

**Lookup-shaped fields decode as their labels, not raw byte indices.** Delay and PARA. EQ
`highCut`, PARA. EQ `lowCut` and `midFreq`, and ENHANCER `lowFreq` and `highFreq` read as
`"3.15kHz"` where they used to read as `22`. Byte layout is unchanged; only the decoded JSON
differs. `HIGH_CUT_MAP` and `LOW_CUT_MAP` are no longer exported, since the codec handles labels
directly.

**On/off params are real booleans.** `trigger` across FEEDBACKER, VIBRATO, S-BEND, the
WARP/TWIST/GLITCH/REVERSE delay sub-algorithms and TERA ECHO, RING MOD's `intelligent`, and `solo`
on amp/odds/OD-DS were variously an `"OFF"`/`"ON"` string, a raw number, or a boolean depending on
where you found them. They are `true`/`false` end to end now, over a `boolean` param domain and a
validating `bool` codec field.

**`subType` is the only way a model or sub-algorithm is selected.** Ten effects store that selector
in their own param block rather than in the shared FX header, and the codec used to expose it
inconsistently: FIXED WAH's was named `wahType` and never threaded into the encoded bytes at all,
so its model was silently dropped, and the FX-slot REVERB picked its algorithm through
`params.type`. All ten round-trip through `subType`. Where the codec still mirrors the value into
`params.type` internally, `read_patch`, the CLI's `read`, and the generate tool's echo drop the
mirror through the new `patchView.presentPatch`, so an agent sees one selector rather than two it
has to keep in agreement.

**Blocks and fields that were undecoded now decode**: the `pfx` block (expression pedal WAH and
PEDAL BEND), `solo` and `soloLevel` on both the dedicated AMP block and the FX-slot OD/DS, and
`patch.key`, the song key HARMONIST resolves its diatonic intervals against.
