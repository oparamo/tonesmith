---
"@tonesmith/core": major
"@tonesmith/cli": major
"@tonesmith/mcp": major
---

A tempo-synced value reads as the note it is.

Delay times, pre-delays and modulation rates store either a number or one of eighteen note values,
which the GX-1 keeps in the codes immediately above each param's numeric ceiling. Those codes now
decode as their note names, so `delay.params.time` reads `400` or `"1/4"`, and both forms are
writable through `generate_patch`, `write_fields` and the CLI's `write`. Reading them as numbers
made a quarter-note delay report 2010 ms, roughly four times what it plays, and a patch read off
the device was then rejected as out of range when sent back unchanged.

`ParamSpec` gains a `numericOrNamed` kind carrying `min`, `max` and `values` together, for a param
that takes a number and a set of named settings alike. `describe_device` lists the note values with
the param, and the CLI's `capabilities` prints them, so the second form is readable up front rather
than learned from a rejection.

The delay's ANLG MOD type advertised the 12-1200 ms range that belongs to ANALOG. It writes the
address every other type shares, so its time is 1-2000 ms.
