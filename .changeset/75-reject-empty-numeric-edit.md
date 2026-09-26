---
"@tonesmith/core": patch
---

An empty or whitespace-only string written to a numeric field through a dot-path edit is rejected
as the wrong kind of value, naming the field, instead of silently landing as the number 0.
`amp.params.gain=""` used to build a patch with `gain` at 0 and report the edit as if it had asked
for that; it now throws the same way a non-numeric string does.
