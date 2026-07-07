---
"@tonesmith/cli": patch
"@tonesmith/mcp": minor
---

Decoupled the CLI's command wiring and the MCP server's tool registration from GX-1 specifically,
so adding a second device means adding a `devices/<id>/` folder and one roster entry — no changes
to shared code.

`@tonesmith/cli`: `configureGx1Commands` became the device-agnostic `configureDeviceCommands<T
extends Patch>(cmd, driver: PatchDriver<T>, printPatch)` in `cli/src/common/commands.ts`. The single
GX-1-specific cast (`driver as PatchDriver<gx1.Patch>`) now lives only in `cli/src/devices/gx1/index.ts`,
documented as a fact the device roster's shared type can't express.

`@tonesmith/mcp`: moved `generate-patch.ts` and its `FxBlockSchema` into `mcp/src/devices/gx1/`,
and renamed the tool `generate_patch` → `generate_gx1_patch` (per-device generate tools; a fully
generic one is deferred until the device count grows). `mcp/src/devices/index.ts` now holds the
roster (`registerGx1Tools`), looped by `buildServer()` alongside the four device-agnostic tools.
