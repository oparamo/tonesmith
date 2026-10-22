---
"@tonesmith/core": major
---

`PatchDriver` carries `id`, `name` and `capabilities` and the six methods core and its consumers
actually call: `parseFile`, `serializeFile`, `newFile`, `buildPatch`, `applyEdits` and `viewPatch`. `decodePatch`, `encodePatch` and `blankPatch` are gone from it, along with the
`RawPatch` type. Every file operation reads and writes whole files, so a single patch's raw form was
never something a caller could use, and a new device no longer has to implement three methods
nothing calls. `newFile(setName, 1)` gives a blank patch.
