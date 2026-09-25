---
"@tonesmith/core": major
---

`PatchDriver` gains `buildPatch(spec)`. It builds a patch from a plain object, validating it
against the device's own capability catalog and reporting every issue at once rather than the
first one hit, and returns the patch exactly as a file stores it: a caller showing it shows what
reading the file back returns. Anyone implementing the interface for their own device must add it.
