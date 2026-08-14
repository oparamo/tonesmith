---
"@tonesmith/core": patch
"@tonesmith/cli": minor
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
A pair with no `=` in it is rejected naming the argument as typed: `write f.tsl 0 amp.gain` sliced
at index -1 and reported `amp.gai` as an unknown field while listing `gain` among the valid ones.

`read` no longer hides a bypassed OD/DS block. Every other block prints with `[OFF]` and its
settings, and the device keeps a bypassed block's settings, so hiding it concealed the sound parked
behind the bypass. A patch's `memo` prints too, when it has one.

**`tonesmith --version` reports the version** instead of failing as an unknown option.

**`capabilities` treats the chain like the groups it is listed beside.** It matched `chain`
case-sensitively while every real group matches either case, so `capabilities CHAIN` failed with a
list that did not mention chain; and `capabilities chain bogus` printed the chain while
`capabilities amp bogus` errored. Both now behave the way the neighboring groups do.

**Color is gated on a terminal reading the output.** The escape sequences were unconditional, so
`capabilities fx > types.txt` filled the file with them and a pipe carried them into whatever read
next. They are emitted only when stdout is a TTY and `NO_COLOR` is unset.

**A failing command sets the exit code rather than calling `process.exit`**, so output piped into
another command finishes flushing instead of arriving truncated.
