---
"@tonesmith/core": major
---

`patchUtils` is `patchService`. It is where every operation on a patch file lives (read, edit,
save, copy, create), which is what a service layer is, and the old name read as a grab bag of
helpers. Every function keeps its name and signature, so a consumer renames the namespace and
nothing else. The lookups beside it are `capabilityService` for the same reason.
