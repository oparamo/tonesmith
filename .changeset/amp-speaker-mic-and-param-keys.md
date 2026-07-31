---
"@tonesmith/core": minor
---

Add the amp block's speaker and mic to the param catalog, and stamp `key` on single-shape block params.

The amp block carries a speaker cabinet and a microphone, but neither was a catalog param, and
capabilities derives from the catalog — so looking up the amp block, or any amp model, returned every
parameter except those two, with nothing to indicate the answer was incomplete. Both are now ordinary
amp params carrying their allowed values, which also completes an item lookup because the item view
merges the block's own params. The codec↔catalog parity guard covers them rather than excepting them.

Params on the single-shape blocks (amp, odds, ns, fv) now carry `key` — the field name to write when
building or editing a patch — as the per-type blocks' params already did. The asymmetry previously had
to be explained; now it isn't there.
