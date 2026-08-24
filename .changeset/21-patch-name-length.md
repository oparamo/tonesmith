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

A 17th character is refused rather than dropped. The codec used to cut the name to fit and report
the write as done, so a name that came back shorter than the one sent looked like a display quirk.
A name using characters the device cannot show, such as `Café`, is refused the same way and names
the characters it cannot store.

Reading and writing a patch also leaves a name alone that this codec did not author. Both directions
ran through Node's `"ascii"`, which masks the top bit, so any byte above `0x7F` in a name decoded as
a different character and was written back as that one, changing a file that was only ever read.
They use `"latin1"` now, which is identical below `0x80` and byte-exact above it.
