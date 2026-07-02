---
"@tonesmith/core": minor
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Rename all GX-1 field names to camelCase (`preDelay`, `highCut`, `subType`, etc.) and correct
numerous delay, reverb, and effect-parameter byte-layout bugs, cross-validated against real device
data. Fixes the `MEMORY%CHAIN` linked-list encoding, the OD/DS type-selector location, and the
`PARA. EQ`/`PITCH SHIFT`/`HARMONIST` value tables. Rounds out the builder API with an `fv()`
setter, an `ns()` detect param, and validation on `delay()`/`reverb()` extra params. Also fixes a
`generate_patch` MCP tool bug where the chain string wasn't parsed into a node array.
