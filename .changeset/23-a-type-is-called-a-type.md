---
"@tonesmith/core": major
"@tonesmith/mcp": major
"@tonesmith/cli": patch
---

The capability catalog calls a block's selectable types types.

`CapabilityItem` is `CapabilityType`, `CapabilityGroup.items` is `CapabilityGroup.types`, and
`capabilityUtils.findItem` is `findType`. The id in that list is the value a patch spec writes as
`type`, so "item" was a second name for something that already had one, and the type's own doc
comment described it as "one of the models or types a block offers". An entry also carries
`subTypes`, which under the old name meant a thing that is not a type has sub-types.

`describe_device` answers a group listing under `types` rather than `items`, and its prose says
`"<group>/<type>"`. Its **input** field stays `items`: an entry there is `"chain"`, a group id, or
`"<group>/<type>"`, so it names things to look up rather than types.

The CLI's `capabilities <group> <type>` takes the same argument it always did, now named for what it
is in `--help`.
