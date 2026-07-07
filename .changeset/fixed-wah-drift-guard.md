---
"@tonesmith/core": minor
"@tonesmith/mcp": patch
---

Fix FIXED WAH's model selector being silently dropped: its codec field was named `wahType` and
`"FIXED WAH"` was missing from `PARAM_SUBTYPE_EFFECTS`, so `fx(patch, slot, "FIXED WAH", "VO WAH")`
never threaded the subType into the encoded bytes, and decoding never promoted it back to
`block.subType`. Renamed the field to `type` (matching COMPRESSOR/LIMITER/AC RESO/etc.) and
registered `"FIXED WAH"` in `PARAM_SUBTYPE_EFFECTS`, so it now round-trips through `subType` like
every other param-block-selected effect. Also fixed `capabilities.ts`'s FIXED WAH param list
(`FREQ` → `MANUAL`, which is what the codec actually decodes) and removed a `DIRECT` param
wrongly listed on the dedicated Delay block's capabilities (no such field exists in the codec or
the hardware manual).

Added a semantic drift guard (`core/tests/devices/gx1/capabilities.test.ts`) that checks every
`fx`/`pfx` capability item's declared params against the corresponding codec field map, every
`delay`/`reverb` group param against the union of fields across all types of that block, and every
FX item with `subTypes` against `PARAM_SUBTYPE_EFFECTS` — so this class of drift fails a test
instead of silently shipping.

`@tonesmith/mcp`'s `generate_patch` FIXED WAH example/tests updated to build the model via
`subType` instead of a `params.wahType` string.
