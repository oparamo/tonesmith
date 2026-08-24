---
"@tonesmith/core": major
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

What a dot-path means is the device's own knowledge, so the driver is what answers it.

`PatchDriver.validateFields(patch, edits)` becomes `applyEdits(patch, edits)`, which takes the
edits as `[path, value]` pairs, applies them in the order given, and returns what each one wrote
keyed by path. `patchUtils.applyFieldEdits`, `setByPath` and `coerceValue` are gone: core split a
path on `.` and walked the decoded object literally, then handed the result to the driver to judge,
so the path vocabulary was the decoded shape and two layers each held half the answer. The GX-1
driver was re-deriving the same structural split for itself to do its half.

A path the device has no field for is now reported alongside every value the device cannot store,
rather than thrown on its own before the rest of the batch is looked at. One rejected write answers
with everything wrong with it, which is what a caller fixing it needs. The batch is still all or
nothing: nothing reaches the file unless every edit in it is usable.

`FieldEdit` is exported for the `[path, value]` pair, and `FieldEdits`, the record of what landed,
is keyed to `FieldValue` rather than `unknown`.
