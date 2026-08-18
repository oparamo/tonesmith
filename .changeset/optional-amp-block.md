---
"@tonesmith/core": minor
"@tonesmith/mcp": patch
---

A patch spec no longer has to name an amp.

`MEMORY%AMP` byte 0 is the amp's own on/off, the same byte every other bypassable block carries, so
the device runs a patch with the amp switched off. Requiring one was a judgment about what a patch
ought to be for rather than anything the hardware enforces, and it refused two shapes the device is
fine with: a spec that leaves the block out, and `amp: { on: false }` on its own, which was rejected
for having no `type` on a block it was switching off. Both now build the same patch, with the amp
off at the device's factory defaults, exactly as every other omitted block already did.

An amp that is on still needs a `type`, which is the rule for every block with models and not an
amp rule. FV remains the one block that cannot be bypassed, because it has no on/off byte to write.

This makes the capability metadata true: `describe_device`'s chain summary already told callers
that every block but FV can be switched off by leaving its spec out.
