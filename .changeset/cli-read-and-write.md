---
"@tonesmith/core": patch
"@tonesmith/cli": patch
---

Fixes to reading and editing patches from the command line.

`coerceValue` silently corrupted boolean field writes (`amp.on`, `amp.solo`, `pfx.on`). A `"true"`
or `"false"` string passed straight through to `Number()` and landed as `NaN`. Both coerce to real
booleans now.

`write` takes fully qualified `field=value` pairs (`key=G`) instead of a separate `<block>`
argument, so it can target top-level `Patch` scalars, matching what the MCP tool always accepted.

`read` no longer hides a bypassed OD/DS block. Every other block prints with `[OFF]` and its
settings, and the device keeps a bypassed block's settings, so hiding it concealed the sound parked
behind the bypass. A patch's `memo` prints too, when it has one.
