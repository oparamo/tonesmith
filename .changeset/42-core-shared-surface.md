---
"@tonesmith/core": minor
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Logic the CLI and the MCP server had each written for themselves lives in `@tonesmith/core`, and
neither surface is tied to a particular device any more.

Added to core: `capabilityService.findGroup` and `findType`; `patchService.resolvePatch` and
`resolvePatches` (the patch a ref names and the index it sits at, one patch or the whole file). Each
replaced a pair of near-identical implementations, one per surface, which is also why the CLI's
`read` stopped printing `type=<model>` in an fx slot's params line when the label already shows the
model.

`capabilityService.lookup(caps, groupId, typeId?)` resolves what the CLI's `capabilities` and MCP's
`describe_device` both answer: the chain, a group, or one type. A type comes with its block's own
controls ahead of its params, and the chain with the patch name limit and the patch settings. Both
surfaces match `chain` in either case, the way they match group ids, and both refuse a type under
the chain. `CHAIN_ENTRY` is the name the chain answers to.

`configureDeviceCommands(cmd, driver)` builds the CLI's commands from a `PatchDriver<T>` rather
than from GX-1 specifically, and the MCP server registers its device-agnostic tools once. Adding a
device means adding a `core/src/device/<id>/` folder and one line in the core roster, with no
change to shared code and no file of its own under `cli/` or `mcp/`. The shared
commands and tools describe themselves without naming any one device's file format, since ".tsl"
is GX-1's, not a property of the layer above it.
