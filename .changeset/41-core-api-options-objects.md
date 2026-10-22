---
"@tonesmith/core": major
---

`patchService.upsertPatches(driver, request)` saves patches into a file by name, replacing a
same-named patch and appending the rest. The request is an options object, `UpsertRequest`, since a
path, an array and an optional name in a row would type-check with any two of them transposed:

```ts
upsertPatches(driver, { path: "tones.tsl", patches: [lead, rhythm], setName: "My Set" });
```

The request takes either `patches` or `specs`, never both. `specs` are plain spec objects that the
save builds through `driver.buildPatch` before it reads or writes anything, so one bad spec leaves
the file as it was, and the rejection names the spec's position and name. `patches` are saved as
given, which is how a patch decoded from another file keeps the bytes its codec doesn't decode.

```ts
upsertPatches(driver, { path: "tones.tsl", specs: [{ name: "GLASSY", amp: { type: "JC-120" } }] });
```

To save one patch, pass a one-element array. Whatever the count, the file is read once and
written once, so a whole set lands in one write rather than a read and write
cycle per patch.

The GX-1 builder functions, which took positional argument lists (`amp` alone took twelve), are no
longer published. A patch is built from a spec through `gx1.driver.buildPatch`.
