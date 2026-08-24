---
"@tonesmith/core": minor
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Logic the CLI and the MCP server had each written for themselves lives in `@tonesmith/core`, and
neither surface is tied to a particular device any more.

Added to core: `capabilityUtils.findGroup` and `findType`; `patchUtils.resolvePatch` and
`resolvePatches` (the patch a ref names and the index it sits at, one patch or the whole file). Each
replaced a pair of near-identical implementations, one per surface, which is also why the CLI's
`read` stopped printing `type=<model>` in an fx slot's params line when the label already shows the
model.

`configureDeviceCommands(cmd, driver)` builds the CLI's commands from a `PatchDriver<T>` rather
than from GX-1 specifically, and the MCP server registers its device-agnostic tools once. Adding a
device means adding a `core/src/devices/<id>/` folder and one line in the core roster, with no
change to shared code and no file of its own under `cli/` or `mcp/`. The shared
commands and tools describe themselves without naming any one device's file format, since ".tsl"
is GX-1's, not a property of the layer above it.
