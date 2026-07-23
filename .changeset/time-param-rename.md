---
"@tonesmith/mcp": minor
---

`generate_gx1_patch` speaks plain `time` everywhere: the `delay.timeMs` and `reverb.timeS`
unit-bearing aliases are renamed to `delay.time` and `reverb.time`, matching the decoded field
name shown by `read_patch` and used by `write_field` dot-paths. Units stay documented in each
field's description (delay in milliseconds, reverb in seconds). Breaking for callers of that
tool using the old alias names.
