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

**A chain is the complete block order.** `gx1.validateChain()` takes every block exactly once,
first to last, and rejects a partial list, naming the blocks left out and the default order to copy
and edit. A partial list used to be filled in by reinserting each missing block after its default
predecessor, which could carry a listed block clear to the end of the chain: `["OD/DS", "FX1"]`
resolved to FX1 sitting after the reverb. Omitting `chain` entirely still takes the default order,
and `generate_gx1_patch` states the stored order in its response, so a caller that omitted it sees
what it took.

**Every block bypasses uniformly.** `amp()`, `fx()` and `odds()` gained an `on` option, so
`on: false` turns off any block except FV, which is always active; OD/DS could previously only be
disabled by leaving it out. On the generate tool, a bare `{ on: false }` is accepted on any
bypassable block. It used to fail validation demanding `type` and the block's other required
fields, with an error naming a missing field and no hint that leaving the block out was the
intended move.

A block's position and its on/off state are separate inputs, and the chain view now says so rather
than using "omit" for both. To leave a block off, leave its spec out of the patch: it takes no
params, so nothing has to be invented for a block that isn't sounding. Passing `on: false` alongside
a full block keeps those params behind the bypass, so it can be switched on later with those
settings intact.

**Encoding rejects a malformed chain.** The GX-1 stores the chain as a linked list in which each
block's own slot names its successor, so a chain that repeats a block overwrites that block's slot
and every block between the two occurrences drops out of the list. The file still encoded and the
patch came back with blocks silently missing: setting `chain.0` of the default order to `AMP` by
dot-path collapsed a 10-block chain to 6, losing PFX, FX1, OD/DS and NS, and the write reported
success. `encodeChain` now requires a list holding every block exactly once, and says which block
is duplicated or missing.
