---
"@tonesmith/core": minor
---

A block built without explicit params comes out matching what the hardware loads when you select
that type.

Every GX-1 block stores each of its types in a distinct shadow byte window, all present at once, so
one factory-default export carries the true default for every type of every block. Those are
harvested into a single `DEFAULTS_BY_TYPE` source, guarded against the fixture by a drift test, and
the builders fill any param the caller leaves unset from it.

A type's sub-model is filled the same way. An effect that offers a choice of models is always set to
one of them, so leaving `subType` out means the model the device opens on rather than whatever the
slot's bytes were carrying. An FX-slot OD/DS built with no model chosen came out MID BOOST where the
device opens on CLEAN BST, and an FX-slot DELAY came out with every param at 0, because the
sub-algorithm is what selects the field set and there was none to default from. The selected models
are harvested from the same factory-default export as the values, so they are the device's own.

This replaces a three-entry hand-maintained override table plus a `defaultForField` heuristic that
guessed from the field's shape. The guesses were musically wrong for most types: an unset SHIMMER
reverb `pitch` came out 0 where the device uses 12, and a Tremolo built with no params came out
`rate 0 / depth 0` instead of `75 / 50`. `defaultForField` is gone.

Filling also closes a bug where switching a block's type left every param the caller did not set at
whatever bytes the previous type had written, most visibly GEQ bands sitting at -20 dB instead of
0 dB. Lookup-shaped fields whose table carries a `FLAT` or bypass entry default to that entry
rather than to the table's first, since `FREQ_HIGH_CUT` starts at 20 Hz and would otherwise default
every delay to an aggressive low-pass.
