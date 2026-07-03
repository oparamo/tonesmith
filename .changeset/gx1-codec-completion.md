---
"@tonesmith/core": minor
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Rename all GX-1 field names to camelCase (`preDelay`, `highCut`, `subType`, etc.) and correct
numerous delay, reverb, and effect-parameter byte-layout bugs, cross-validated against real device
data. Fixes the `MEMORY%CHAIN` linked-list encoding, the OD/DS type-selector location, and the
`PARA. EQ`/`PITCH SHIFT`/`HARMONIST` value tables. Adds `AMP`/`OD-DS` `solo`/`soloLevel` (both the
dedicated block and the FX-slot OD/DS variant), a new `pfx` block (expression pedal WAH / PEDAL
BEND), and a new `patch.key` field (the song key HARMONIST's diatonic intervals resolve against) —
all previously undecoded. Rounds out the builder API with an `fv()` setter, an `ns()` detect param,
a `pfx()` setter, a `key` param on `basePatch()`, and validation on `delay()`/`reverb()`/`pfx()`
extra params. Also fixes a `generate_patch` MCP tool bug where the chain string wasn't parsed into a
node array.

`core/docs/gx1/FORMAT.md` (not published in the package, but the canonical reference for this
codec) was audited end-to-end against the device's own address table and the official manual,
reordered to match the actual block layout, and rewritten so every section reads top-to-bottom
without needing to jump around — this is now the structural template for future devices' format docs.
