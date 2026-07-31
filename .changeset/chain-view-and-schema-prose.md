---
"@tonesmith/core": patch
"@tonesmith/mcp": patch
---

Tighten the signal-chain view and stop repeating the same rules across the patch-building schema.

The chain's worked example now covers both of its controls at once: it reorders some blocks and
switches another off, and the resolved order marks the off block, so one result shows that a block
left out of the order travels with its default predecessor while a bypassed block keeps the slot the
order gave it. The example is shared between the chain view and the generate tool description, so the
two cannot describe it differently, and the surrounding prose no longer restates what the example
demonstrates.

Rules that had been stated in many places are now stated once and signposted from the rest — bypass in
the chain view and on each block's `on` field, batching in the server instructions and on the `items`
input. Each bypassable block still names omission as the way to leave it off, at the point where that
choice is made.
