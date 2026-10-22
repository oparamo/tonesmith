---
"@tonesmith/core": major
---

`patchUtils` is gone, and `patchService` is where every operation on a patch file lives (read,
edit, save, copy, create). Its three functions have replacements rather than new names:
`resolvePatchIndex` is `patchService.resolvePatch`, which answers with the patch and its index
together, and `setByPath` and `coerceValue` are `PatchDriver.applyEdits`. The capability lookups
are `capabilityService`.
