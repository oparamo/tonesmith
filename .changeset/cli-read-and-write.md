---
"@tonesmith/core": patch
"@tonesmith/cli": patch
---

Fixes to reading, editing and starting patch files from the command line.

`new` takes `--set-name` and `--count` in place of two positional operands. A count sat in the
second slot behind a set name, so `new tones.tsl 8` named the set "8" and asking for eight blank
patches meant naming the set as well. A `--count` that is not a whole number is a usage error now,
rather than a `NaN` that opened the file with no patches in it.

`coerceValue` silently corrupted boolean field writes (`amp.on`, `amp.solo`, `pfx.on`). A `"true"`
or `"false"` string passed straight through to `Number()` and landed as `NaN`. Both coerce to real
booleans now.

`write` takes fully qualified `field=value` pairs (`key=G`) instead of a separate `<block>`
argument, so it can target top-level `Patch` scalars, matching what the MCP tool always accepted.

`read` no longer hides a bypassed OD/DS block. Every other block prints with `[OFF]` and its
settings, and the device keeps a bypassed block's settings, so hiding it concealed the sound parked
behind the bypass. A patch's `memo` prints too, when it has one.
