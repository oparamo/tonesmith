---
"@tonesmith/core": major
"@tonesmith/mcp": patch
---

The patch `generate_patch` echoes back is the patch the file holds.

The builder fills one struct per block covering every type, so echoing that struct reported params
the chosen type does not have: a TERA ECHO reverb came back carrying `time`, `density` and
`preDelay`, none of which it has, and a SHIMMER reverb came back with `density` and `direct`. The
bytes were always right, so reading the file back disagreed with the echo. The echo now round-trips
through the codec first, which is what makes it what a `read_patch` would return. That is what the
tool promises in the first place: the response is the confirmation, and no follow-up read is needed.

That round trip also happens before the file is written, so a patch the codec cannot store fails the
call with the file as it was, rather than after it has been replaced on disk.

A batch that names the same patch twice is rejected, naming the name and both positions.
`patchUtils.upsertPatches` keys on the name, so the second patch replaced the first and the response
reported two saves into a file holding one of them.
