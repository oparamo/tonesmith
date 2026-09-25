---
"@tonesmith/core": major
---

`patchUtils.upsertPatches(driver, path, patches, setName?)` becomes
`upsertPatches(driver, request)`.

A path, an array and an optional name sat in a row where only the driver was distinguishable by
type, so a caller that transposed two arguments got something that type-checked and saved the wrong
thing. It takes an options object now, with `UpsertRequest` alongside it:

```ts
upsertPatches(driver, "tones.tsl", [lead, rhythm], "My Set");

upsertPatches(driver, { path: "tones.tsl", patches: [lead, rhythm], setName: "My Set" });
```

The request takes either `patches` or `specs`, never both. `specs` are plain spec objects that the
save builds through `driver.buildPatch` before it reads or writes anything, so one bad spec leaves
the file as it was, and the rejection names the spec's position and name. `patches` are saved as
given, which is how a patch decoded from another file keeps the bytes its codec doesn't decode.

```ts
upsertPatches(driver, { path: "tones.tsl", specs: [{ name: "GLASSY", amp: { type: "JC-120" } }] });
```

The single-patch `upsertPatch` wrapper is gone; pass a one-element array. Whatever the count, the
file is read once and written once, so a whole set lands in one write rather than a read and write
cycle per patch.

The GX-1 builder functions took positional argument lists with the same problem, `amp` alone taking
twelve. They all take an options object now, but that is an internal detail at this version: the
builders are no longer published, and a patch is built from a spec through `gx1.driver.buildPatch`.
