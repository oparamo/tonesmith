---
"@tonesmith/core": patch
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Each package's README documents the package it ships with, and its npm page carries the links a
visitor looks for.

`@tonesmith/core`'s usage examples now run. Its `buildPatch` example wrote a block's controls as
fields on the block, which the validator rejects, and its read example reached for `patch.amp.gain`
where a decoded block keeps its controls under `params`. Its "what it exposes" list named four
functions that are not exported (`patchUtils.applyFieldEdits`, `coerceValue`, `setByPath`, and
`patchView.presentPatch`) and left out the `PatchDriver` methods that replaced them. It also states
the block shape once, since that is what both corrected examples turn on.

`@tonesmith/cli`'s write example reached for `amp.gain` the same way, and the README now covers what
writing a block's `type` does to the controls already in it.

`write_fields` is documented as what it is on both surfaces that list it: a dot-path edit batch that
also renames the patch set, with `ref` and `fields` optional so a rename names neither a patch nor a
field.

Every manifest gains `keywords`, `homepage` and `bugs`, so an npm page carries working Homepage and
Issues links and the packages turn up in a search. Each README opens with a version and a license
badge, and the two packages that declare a node floor carry one for it.
