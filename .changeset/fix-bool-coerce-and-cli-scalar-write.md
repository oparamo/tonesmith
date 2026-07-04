---
"@tonesmith/core": patch
"@tonesmith/cli": patch
---

Fix `coerceValue` silently corrupting boolean field writes (`amp.on`, `amp.solo`, `pfx.on`, etc.) —
`"true"`/`"false"` strings are now coerced to real booleans instead of passing through and hitting
`Number()` as `NaN`. Also fix the CLI `write` command so it can target top-level `Patch` scalars like
`key` — it now takes fully-qualified `field=value` pairs (e.g. `key=G`) instead of a separate `<block>`
argument, matching the MCP `write_field` tool's existing behavior.
