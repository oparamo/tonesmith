---
"@tonesmith/core": minor
"@tonesmith/mcp": patch
---

Surface the exact valid labels for discrete frequency-lookup params. `ParamSpec` gains an
optional `values` array — the full ordered list of valid labels — populated in the GX-1 param
catalog for the quantized frequency tables (delay/PARA. EQ high & low cut, PARA. EQ mid freq,
ENHANCER low & high freq) straight from the codec's own lookup constants. Previously these params
carried only a compact `range` summary ("20 Hz-12.5 kHz, FLAT"), so a consumer couldn't tell
whether "2.5kHz" or "2.50kHz" was the valid spelling.

`describe_device` now includes `values` for those params (it already serializes the full
ParamSpec), so an agent building a patch can enumerate the exact valid labels instead of guessing.
A new codec↔catalog guard locks each `values` list to the codec's lookup table.
