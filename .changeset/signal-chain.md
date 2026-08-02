---
"@tonesmith/core": major
"@tonesmith/cli": major
"@tonesmith/mcp": major
---

The signal chain is a first-class part of the device model, and it is an array everywhere.

`DeviceCapabilities` carries a `ChainSpec` (a description plus the device's default block order)
that `describe_device` and the CLI's `capabilities chain` surface as their own view. The
MCP server's onboarding instructions send a connected agent there first, since the chain is what
the rest of a patch hangs off.

**Breaking:** `generate_gx1_patch`'s `chain` input is a `string[]`, first element first in the
chain, instead of a `">"`-delimited string, and the CLI prints a chain as a comma-separated list.
`"OD"` is still an alias for `"OD/DS"`.

A partial order expands through `gx1.normalizeChain()`, and the merge rule is stated the way it
actually works. Both surfaces used to say a block left out of a partial chain "keeps its default
position". It is reinserted immediately after whichever block precedes it in the default order, so
it travels with that neighbor rather than holding a fixed slot. The two rules agree on contiguous
reorders and diverge on everything else, which made a resolved order unpredictable from the docs.
One worked non-contiguous example is shared between the chain view and the generate tool
description, so the two cannot describe it differently, and a guard asserts the example still
demonstrates an omitted block leaving its default slot. `generate_gx1_patch` states the resolved
order in its response as well, so a caller does not have to infer whether its reorder was honored.

**Every block bypasses uniformly.** `amp()`, `fx()` and `odds()` gained an `on` option, so
`on: false` turns off any block except FV, which is always active; OD/DS could previously only be
disabled by leaving it out. On the generate tool, a bare `{ on: false }` is accepted on any
bypassable block. It used to fail validation demanding `type` and the block's other required
fields, with an error naming a missing field and no hint that omitting the block was the intended
move.

Bypassing and omitting are both valid and they store different bytes, so the docs name one instead
of calling them equally valid and leaving two correct-sounding runs to produce different files.
Omission is preferred and leaves the block off at factory defaults. Passing `on: false` alongside a
full block keeps those params behind the bypass, so it can be switched on later with those
settings intact.

**Encoding rejects a malformed chain.** The GX-1 stores the chain as a linked list in which each
block's own slot names its successor, so a chain that repeats a block overwrites that block's slot
and every block between the two occurrences drops out of the list. The file still encoded and the
patch came back with blocks silently missing: setting `chain.0` of the default order to `AMP` by
dot-path collapsed a 10-block chain to 6, losing PFX, FX1, OD/DS and NS, and the write reported
success. `encodeChain` now requires a list holding every block exactly once, and says which block
is duplicated or missing.
