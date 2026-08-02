---
"@tonesmith/core": major
---

Positional argument lists become options objects.

`amp(patch, type, gain, bass, mid, treble, speaker, mic, level, solo, soloLevel, on)` was twelve
positional arguments, four of them booleans and seven optional. `reverb` took ten, `odds` nine,
`delay` eight. Arguments of the same type sit next to each other in all of them, so a caller that
transposed two produced a patch that type-checked, saved, and sounded wrong, with nothing at any
layer to catch it. Every GX-1 builder now takes `(patch, options)`: `amp`, `odds`, `fx`, `ns`,
`fv`, `pfx`, `delay`, and `reverb`, with `AmpOptions` through `ReverbOptions` exported alongside
them. `basePatch(name, chain, key)` keeps its three positional arguments.

`patchUtils.upsertPatches(driver, path, patches, setName?)` had the same problem in a smaller way,
a path and an array and an optional name in a row where only the driver was distinguishable by
type. It takes `(driver, request)` now, with `UpsertRequest` exported alongside it. The
single-patch `upsertPatch` wrapper is gone; pass a one-element array. Whatever the count, the file
is read once and written once, so a whole set lands in one write rather than a read and write
cycle per patch.

Migrating is mechanical, and TypeScript points at every call site:

```ts
amp(patch, "JC-120", 60, 55, 50, 45);
fx(patch, "fx1", "CHORUS", null, { rate: 50 });
upsertPatches(driver, "tones.tsl", [lead, rhythm], "My Set");

amp(patch, { type: "JC-120", gain: 60, bass: 55, middle: 50, treble: 45 });
fx(patch, { slot: "fx1", type: "CHORUS", params: { rate: 50 } });
upsertPatches(driver, { path: "tones.tsl", patches: [lead, rhythm], setName: "My Set" });
```

Two things move with the shape. `amp`'s tone control is `middle`, matching the field it writes and
the name the generate tool uses, where the positional parameter was `mid`. And the `on` default
lives in the builders, so a block is active unless the caller passes `on: false`, instead of every
call site repeating `?? true`.

Each options interface matches the corresponding block of the generate tool's schema field for
field, so a validated block spec passes straight to its builder and the compiler checks the match.
