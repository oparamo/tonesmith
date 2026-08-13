---
"@tonesmith/core": patch
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
