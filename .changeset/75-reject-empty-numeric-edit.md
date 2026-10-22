---
"@tonesmith/core": patch
---

An empty or whitespace-only string written to a numeric field through a dot-path edit is rejected
as the wrong kind of value, naming the field, the same as any other non-numeric string. It is never
stored as 0.
