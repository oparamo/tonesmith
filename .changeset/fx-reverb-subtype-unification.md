---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
---

The FX-slot REVERB now selects its algorithm (HALL S, HALL M, PLATE, ROOM, STUDIO) via `subType`,
like every other effect whose model selector lives in param-block byte p[0] — it was the one
type-field effect still selected through `params.type`. `subType` is now the only model-selection
mechanism on the surface: `describe_device` lists the algorithms as the fx REVERB item's
`subTypes`, the builder threads `subType` into the encoded byte, and decode promotes it back.
The `generate_gx1_patch` subType description is rewritten to state the rule plainly (and drops
the stale claim that some effects select their model via a params entry — PHASER's stage,
SLICER's pattern, and the like are ordinary params, not model selectors). Bytes on disk are
unchanged.
