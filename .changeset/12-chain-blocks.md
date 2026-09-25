---
"@tonesmith/core": major
"@tonesmith/cli": minor
"@tonesmith/mcp": minor
---

Each entry of `capabilities.chain.blocks` describes the block rather than only naming its label:
`{ label, group, bypass }`. `group` is the capability group listing the block's types and controls,
which is how a consumer learns that the GX-1's `fx1`, `fx2` and `fx3` all take the `fx` group's
effects. `bypass` is false for a block the device keeps on at all times, which takes no `on`. A type
only some of its group's blocks offer lists them under `blocks`: the GX-1's OVERTONE names `fx3`.
All three facts were in the chain's prose before; now a consumer can read them as data.
`describe_device` returns them with the chain, and the CLI's `capabilities chain` prints each block
with its label and group.
