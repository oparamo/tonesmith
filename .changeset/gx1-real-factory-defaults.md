---
"@tonesmith/core": minor
---

Fill unset patch params with the device's **real factory defaults** instead of generic guesses.

Every GX-1 block stores each of its types in a distinct "shadow" byte window (all present at once —
see FORMAT.md), so `default-init.tsl` carries the true factory default for every type. Those are now
harvested into a single `DEFAULTS_BY_TYPE` source (guarded against the fixture by a drift test), and
the builder fills any param the caller omits from it. This replaces the old approach — a 3-entry
hand-maintained override table plus a `defaultForField` heuristic — which gave musically-wrong values
for most types (e.g. an unset SHIMMER reverb `pitch` defaulted to 0 instead of the device's 12; a
Tremolo built with no params came out `rate 0 / depth 0` instead of `75 / 50`).

Effect: a block generated without explicit params now matches what the hardware would load when you
select that type. `defaultForField` (an internal, non-public helper) is removed.
