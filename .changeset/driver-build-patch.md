---
"@tonesmith/core": major
---

`PatchDriver` gains `buildPatch(spec)`. It builds a patch from a plain object, validating it
against the device's own capability catalog and reporting every issue at once rather than the
first one hit. Anyone implementing the interface for their own device must add it.
