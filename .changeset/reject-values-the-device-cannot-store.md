---
"@tonesmith/core": major
---

Reject a value the device cannot store instead of writing a corrupt file.

A patch file holds each byte as two hex characters, and the encoder built those with
`byte.toString(16).padStart(2, "0")`. That expression is only correct for a number in 0–255. Handed
a string it returns the string, handed a negative it returns `-1C2`, and `padStart` leaves anything
already two characters alone, so a value that was never a byte reached the file looking like one and
the caller was told the write succeeded. `amp.gain=abc` wrote `ABC` and read back as `Gain=2748`;
`odds.tone=-500` wrote `-1C2`; a LIMITER `ratio` of `"4:1"` wrote `4:1`; and an `on` of `"false"`
wrote `NAN`.

Every write now passes through one guard that throws unless the value is an integer 0–255, so no
block or field can reach the file without it. The four field codecs that used to cast and write
(`signed`, `scaled`, `nibblePair`, `nibbleQuad`) check first as well, at their own scale rather than
the byte's, so the rejection names the param and the range it accepts (`preDelay: value 256 is
outside 0 to 255`) rather than a byte index. A fraction is still legal where the field stores a
scaled value, which is what the scale is for.

The CLI `write` command and the MCP `write_fields` and `generate_patch` tools all encode through
this path, so a rejection replaces silent corruption on every surface.

That guard is the floor, not the message a caller should be reading. Dot-path edits are now checked
against the device's capability catalog the way `buildPatch` has always checked a patch spec, so the
rejection names the block, the param and what it accepts:

```
amp GAIN for NATURAL takes a whole number (got "abc")
odds TONE for OVERDRIVE must be -50-50 (got -500)
ns DETECT must be one of: INPUT, NS INPUT (got "BOGUS")
```

Four more inputs were reaching the codec unchecked, and each is now reported alongside every other
problem in the spec rather than as a throw of its own. `on` and `subType` select a block's shape
rather than set a control, so they were filtered out before the param check and handed to the
builder on a cast: `on: "false"` encoded as `NAN` and `subType: 42` counted as absent. `chain: "PFX"`
surfaced as an uncaught `chain.map is not a function`, and `key: "Am"` built a complete patch before
throwing from the codec at write time. Four params also carried a bare display string (`"1:1-INF:1"`,
`"P01-P20"`) as their whole domain, which gave the validator nothing to check against, so a LIMITER
`ratio` of `"4:1"` was accepted; each now states the values or bounds the device takes, and
HARMONIST's `KEY` names the patch key's own values rather than a form the codec cannot encode.

**Breaking.** `PatchDriver` gains `validateFields(patch, edits)`, which every driver must implement,
and `patchUtils.applyFieldEdits(driver, patch, edits)` takes the driver as its first argument. The
edits are applied to the patch before the check, so a batch that switches a block's type and sets a
param of the new type is validated as the one state it describes rather than against the type the
patch held beforehand.
