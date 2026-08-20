---
"@tonesmith/core": major
"@tonesmith/cli": major
"@tonesmith/mcp": major
---

The patch's own settings are decoded, so a note value has a tempo to play against.

The GX-1 stores five settings for the patch as a whole rather than for any block, and only its
musical key was decoded. A decoded patch now carries all five at the top level beside `name`:
`memoryLevel`, `bpm`, `key`, `carryover` and `tempoHold`. Each is readable through `read_patch`,
settable in a `generate_patch` spec, and writable by dot-path through `write_fields` and the CLI's
`write`. Without `bpm` a control set to a note value played against a tempo nothing could read or
change.

`DeviceCapabilities` gains `patchSettings` beside `patchName`, a list of param specs for what a
device stores per patch. `describe_device`'s `"chain"` entry returns it and the CLI's
`capabilities chain` prints it, which is what makes these settings discoverable at all: they belong
to no group, so `key` had been decoded and unlisted. Every driver declares the field, empty where a
device has no such settings.

Both write paths check a setting against its range and name it in the rejection. A tempo outside
40-250 previously reached the encoder, which reports a byte index rather than the field a caller
typed.
