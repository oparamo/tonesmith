---
"@tonesmith/core": major
"@tonesmith/mcp": patch
---

`DeviceCapabilities` gains a required `patchName: { maxLength }`, stating the longest patch name the
device stores. A driver that doesn't declare it no longer type-checks. It is required rather than
optional deliberately: the name limit belongs to no capability group, so it is the one device fact a
driver can omit without anything noticing, and that is exactly how the GX-1's came to be wrong.

`describe_device` reports it in the device summary and under `items: ["chain"]`, so it is readable
before a patch is built rather than discoverable by having one rejected afterwards.

**GX-1:** patch names may now be up to 16 characters, the full width the format stores. The generate
tool rejected anything longer than 13, a limit with no source behind it. The name field is 16 bytes,
the codec always wrote all 16, and the device's own parameter tables agree, so the cap only ever
removed characters callers were entitled to.
