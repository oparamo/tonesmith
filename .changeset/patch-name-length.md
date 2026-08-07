---
"@tonesmith/core": patch
"@tonesmith/mcp": patch
---

GX-1 patch names may be up to 16 characters, the full width the file format stores. The generate
tool rejected anything longer than 13, a limit with no source behind it: the name field is 16 bytes
and the device's own parameter tables agree. The codec always wrote all 16, so this only ever
removed characters callers were entitled to.

`describe_device` now reports the limit as `patchName.maxLength`, both in the summary and under
`items: ["chain"]`. It belongs to no capability group, so it was previously discoverable only by
having a patch rejected after building it.
