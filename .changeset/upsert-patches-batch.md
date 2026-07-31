---
"@tonesmith/core": minor
---

Add `patchUtils.upsertPatches(driver, path, patches, setName?)` — saves a whole set of patches by
name (replace on match, append otherwise) in array order, reading and writing the file exactly once
however many patches are given. `upsertPatch` is now a one-element delegation to it, keeping its
signature and behavior, so there is a single upsert implementation rather than two.
