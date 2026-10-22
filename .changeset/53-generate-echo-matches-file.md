---
"@tonesmith/core": major
"@tonesmith/mcp": patch
---

The patch `generate_patch` echoes back is the patch the file holds.

A TERA ECHO reverb has no `time`, `density` or `preDelay`, and a SHIMMER reverb has no `density` or
`direct`; the echo carries none of them, and neither does a read of the saved file. `buildPatch`
returns a patch exactly as a file stores it, and the echo is the patch `upsertPatches` saved, so the
response is the confirmation the tool promises and no follow-up read is needed.

Every spec is built before the file is read, so a spec the driver rejects fails the call with the
file as it was, naming the spec's position and name.

A batch that names the same patch twice is rejected, naming the name and both positions.
`patchService.upsertPatches` keys on the name, so the second patch would replace the first and the
response would report two saves into a file holding one of them.
