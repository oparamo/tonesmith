---
"@tonesmith/core": patch
"@tonesmith/mcp": patch
---

Clear up three things agents kept guessing at when building patches.

The chain capability description previously ended by calling omission and `on: false` equally valid
ways to leave a block off, which left callers to pick one at random — and since the two store
different bytes, two correct-sounding runs could produce different files. It now names omission as
the preferred way and explains what passing `on: false` buys you instead: the block's params are
kept behind the bypass so it can be switched on later with those settings intact.

A `describe_device` group listing now states the model-selection rule alongside its other help: an
item that lists `subTypes` needs one of them chosen, and an item with no `subTypes` is selected by
its id alone. The rule was already on the generate tool's `subType` field, but a caller browsing
capabilities meets the concept before it ever reaches that schema.

The `generate_gx1_patch` description now says that any param left unset takes the device's factory
default for the chosen type, and that the echoed patch is therefore the complete resulting state
rather than only the fields that were passed in.
