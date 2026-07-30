---
"@tonesmith/core": patch
"@tonesmith/mcp": patch
---

Make two agent-facing descriptions answer questions they were leaving open.

Looking up the amp block gave an incomplete picture of it. The block carries a speaker cabinet and a
microphone, but their models live in the separate `cab` and `mic` groups, and nothing in the `amp`
group or its items said so — a caller that looked up `amp` and its type had every param except the
two it could not have guessed were elsewhere. The amp group description now names both groups.

The chain worked example covered reordering only, leaving callers to reason out for themselves
whether ordering a block also affects whether it is on. It now switches a block off in the same
example, and the resolved order marks that block, so a single result shows both that unlisted blocks
travel with their default predecessor and that a bypassed block keeps the slot its order gave it.
The example is shared between the chain view and the generate tool description so the two cannot
describe it differently.
