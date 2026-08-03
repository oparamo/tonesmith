---
"@tonesmith/mcp": patch
---

The patch `generate_gx1_patch` echoes back is the patch the file holds.

The builder fills one struct per block covering every type, so echoing that struct reported params
the chosen type does not have: a TERA ECHO reverb came back carrying `time`, `density` and
`preDelay`, none of which it has, and a SHIMMER reverb came back with `density` and `direct`. The
bytes were always right, so reading the file back disagreed with the echo. The echo now round-trips
through the codec first, which is what makes it what a `read_patch` would return. That is what the
tool promises in the first place: the response is the confirmation, and no follow-up read is needed.
