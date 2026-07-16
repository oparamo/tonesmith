---
"@tonesmith/core": minor
"@tonesmith/mcp": patch
"@tonesmith/cli": patch
---

Promote the GX-1 parameter surface into a single in-repo source of truth and close two classes
of completeness gap it exposed.

`@tonesmith/core`: new `param-catalog.ts` holds every block/type's param names, value ranges,
and descriptions. `capabilities.ts` now derives each item's `params` from the catalog instead of
restating them, which makes delay/reverb **per-type** (drillable, e.g. `describe_device gx1
reverb SHIMMER`) rather than one flat list per block. The drift guard is retargeted from
`capabilities ↔ codec` to **`codec ↔ catalog`** (the two independently-authored sources), and is
table-driven so coverage is total across every per-type block.

Codec corrections surfaced while auditing the catalog against the device's own parameters:

- **SHIMMER reverb** now models its separate `PITCH LVL` (byte 10) and shares the standard
  `LEVEL` byte (byte 5) with the other reverb types — previously its level was mis-homed to
  byte 10 and `PITCH LVL` was unmodeled.
- **FX-slot DELAY** is now modeled **per sub-algorithm** (STANDARD / MODULATE / WARP / TWIST /
  GLITCH), like the dedicated DLY block — each carries its own param set (WARP/TWIST/GLITCH add
  trigger/mode/rise-fall/glitch/balance fields that were previously unmodeled). Its sub-algorithm
  is selected via the FX slot's `subType`.
- **FX-slot type enums fixed:** FX-slot DELAY types are their own set (`FX_DLY_TYPES`:
  STANDARD/MODULATE/WARP/TWIST/GLITCH), FX-slot REVERB types are their own set (`FX_REV_TYPES`:
  HALL S/HALL M/PLATE/ROOM/STUDIO), and the dedicated DLY block's TWIST `MODE` is
  RISE-FALL/RISE-FADE — each was previously mislabeled with a different block's values.

Round-trip stays byte-identical; no `.tsl` files change layout. This is a pre-1.0 surface change:
delay/reverb capabilities move from block-level to per-type params, and FX-slot DELAY exposes
sub-algorithm subtypes.

`@tonesmith/mcp` / `@tonesmith/cli`: consume the per-type capabilities. The CLI capabilities
printer now shows each FX-slot DELAY sub-algorithm's params; MCP `describe_device`/generate-patch
descriptions point at `describe_device <block> <type>` as the authoritative param reference.
