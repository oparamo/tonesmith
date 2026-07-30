---
"@tonesmith/mcp": minor
---

Make building patches a bounded number of calls instead of one lookup per effect.

`describe_device` now takes an `items` list in place of `group`/`item`: each entry is `"chain"`, a
group id (`"amp"`), or `"<group>/<item>"` (`"fx/CHORUS"`), split on the first slash so ids that
contain one (`"fx/OD/DS"`) still resolve. The response is keyed by the entry string, so one entry
reads the same as twenty, and a whole patch's worth of lookups is a single round trip. One bad entry
fails the whole call and names itself.

`generate_<id>_patch` now takes `{ outPath, setName?, patches: [ … ] }`, replacing the one-patch-per-
call shape. A whole set goes out in one call and lands in one file write, with array order becoming
the order on the device rather than something the caller has to get right across N calls. Each patch
is echoed back complete with defaults and its resolved chain.

The server `instructions` are rewritten as a bounded procedure — how many calls the work should take
and which shapes get you there — rather than an inventory of the tools.
