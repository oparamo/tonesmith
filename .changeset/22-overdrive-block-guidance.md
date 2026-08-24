---
"@tonesmith/core": minor
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

The capability text says which block to reach for when the device offers the same effect twice.

The GX-1 exposes overdrive in two places: the dedicated `drive` block, and the `OD/DS` entry in the
`fx` group's effect list, carrying the same 35 pedal models. Both are valid, and the fx slot is how
a player stacks a second overdrive on the first. Nothing said so, though, so a caller could put a
patch's only overdrive in FX1, get a working patch built around the wrong block, and see no error to
notice it by.

Both descriptions now state the choice where a caller meets it. Browsing the fx effect list says the
dedicated block carries the same models and is where a patch's overdrive belongs; the `drive` group
says the fx slots carry them too, for a second overdrive in the chain. Nothing about what is
accepted has changed, and the text lives in `describe_device`, so it costs nothing in `tools/list`.
