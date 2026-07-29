---
"@tonesmith/core": patch
---

Refuse to encode a chain that isn't a complete, duplicate-free block order.

The GX-1 stores the signal chain as a linked list in which each block's own slot names its
successor. A chain that repeats a block therefore overwrites that block's slot, and every block
between the two occurrences drops out of the list — the file still encodes, and the patch comes
back with blocks silently missing. Editing a single chain slot by dot-path (`chain.0`) was enough
to trigger it: setting slot 0 of the default order to `AMP` collapsed a 10-block chain to 6,
losing PFX, FX1, OD/DS and NS, and the write reported success.

`encodeChain` now requires its input to be a list holding every block exactly once, and says which
block is duplicated or missing rather than reporting on a stray character. Setting `chain` to a
bare string — the shape a dot-path edit produces, since those values are strings — is rejected with
a message naming the blocks it expected.

This does not change how partial chains are supplied when building a patch: `normalizeChain`
expands a caller's partial order into the full 10-block chain before anything is encoded, so
`generate_gx1_patch` still takes just the blocks you want to move.
