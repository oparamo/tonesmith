---
"@tonesmith/core": major
"@tonesmith/cli": major
"@tonesmith/mcp": major
---

Every block takes one shape, and a device's driver is the only thing that knows its format.

**A block is its selectors and one `params` bag**, on the way in and on the way out, for every
block of every device. `on`, `type` and `subType` are the complete set of keys beside `params`, so a
device's controls keep whatever names its panel prints, `type` among them, with nothing they can
collide with. The GX-1 had nine blocks carrying params flat and three fx slots nesting them, and a
caller working by analogy from one met a rejection on the other. `PatchBlock` in the type barrel is
the contract, and a conformance suite holds every registered driver to it rather than trusting each
device's own tests.

**Blocks are named for what they are, not for what the front panel abbreviates them to.** `odds` is
`drive`, `ns` is `noiseGate`, `fv` is `volume`, and `pfx` is `pedalFx`. The device's own labels are
still available: `capabilities.chain.blocks` maps every block name to the label printed on the unit,
which is what a manual or a photo shows.

**The chain names blocks the same way a patch spec does.** It read `["PFX", "FX1", "OD/DS", …]`
while a spec keyed the same blocks `pfx`, `fx1`, `odds`, so three of the ten had to be converted by
eye. It is one vocabulary now, and the `"OD"` alias is gone with the second spelling it existed for.

**Dot-paths gain a level for the blocks that were flat**: `amp.gain` is `amp.params.gain`. A path
now says which kind of thing it touches, since `amp.on` is block state and `amp.params.gain` is a
control.

**A patch read back is a patch that can be sent straight back.** Two things stopped it: a block
whose type has no variants reads `subType: null`, which the spec validator rejected as not a
variant name, and `memo`, the device's own note field, was decoded but had no way in. `null` now
means what leaving `subType` out means, and a spec takes `memo`.

**A block's params are rebuilt on a type change** rather than merged over what was there, so the
types of one block no longer leave each other's controls behind: a `pitch` left over from SHIMMER
is not a control SUB DELAY has, and it no longer shows up on one.

`FxParams` is `BlockParams`, since it is every block's params type now. The GX-1 block types are
`DriveBlock`, `NoiseGateBlock`, `VolumeBlock` and `PedalFxBlock`, and each single-shape block also
exports its params type.
