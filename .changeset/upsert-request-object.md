---
"@tonesmith/core": major
---

`upsertPatches` takes a request object, and the single-patch `upsertPatch` wrapper is gone.

`upsertPatches(driver, path, patches, setName?)` put a path, an array, and an optional name in a row
where only the driver was distinguishable by type. It now takes `(driver, request)`, with
`UpsertRequest` exported alongside it:

```ts
upsertPatches(driver, "tones.tsl", [lead, rhythm], "My Set");

upsertPatches(driver, { path: "tones.tsl", patches: [lead, rhythm], setName: "My Set" });
```

`upsertPatch` saved one patch through the same batch path and had no caller left in the repo. Pass a
one-element array instead: `upsertPatches(driver, { path, patches: [patch] })`.
