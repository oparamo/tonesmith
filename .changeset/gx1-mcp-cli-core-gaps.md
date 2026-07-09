---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
"@tonesmith/cli": patch
---

Fix a set of gaps found while generating a large batch of GX-1 patches through MCP: missing parent
directories on write, `generate_gx1_patch` overwriting instead of appending/replacing by patch
name, an inconsistent chain representation across MCP/CLI/core, several lookup-shaped byte fields
(delay/PARA. EQ/ENHANCER frequency fields) decoding as raw indices instead of labels, FX params
left at stale bytes on a type switch (most notably GEQ bands defaulting to −20 dB instead of 0 dB),
unvalidated FX param keys, capabilities.ts under-reporting several FX types' `DIRECT`/other params,
and drifted MCP zod bounds/descriptions.

Breaking changes (pre-1.0, no back-compat shims):

- **Chain is an array everywhere.** `generate_gx1_patch`'s `chain` input is now
  `string[]` (first = first in chain; `"OD"` is still an alias for `"OD/DS"`) instead of a
  `">"`-delimited string. Partial/reordered arrays are expanded to the full 10-block chain via the
  new `gx1.normalizeChain()`, preserving the caller's relative order. The CLI prints the chain as
  a comma-separated list instead of `→`-joined.
- **Several codec fields now decode/encode as labels instead of raw indices**: delay/PARA. EQ
  `highCut`, PARA. EQ `lowCut`/`midFreq`, and ENHANCER `lowFreq`/`highFreq` (e.g. `"3.15kHz"`
  instead of `22`). Byte layout is unchanged — only the decoded JSON shape differs.
- **`fx()` now throws on an unknown param key** for the current FX type (e.g. `speedSelect` for
  ROTARY, whose field is `speed`), matching the existing behavior of `pfx()`/`delay()`/`reverb()`'s
  `extra` params.
- **`fx()`, `delay()`, `reverb()`, and `pfx()` now fill unset type-specific params with sane
  defaults** instead of leaving them at whatever bytes were already in the block, via the new
  `gx1.defaultFxParams()` and an extended `assignExtra`. This closes the same bug class for
  delay/reverb/pfx sub-type fields as for FX slots: e.g. SHIMMER delay's `pitch`, every PEDAL
  BEND/WAH `pfx()` field, and SUB DELAY/TERA ECHO reverb's `feedback`/`highCut`. Lookup-shaped
  fields whose table lists a `"FLAT"`/bypass entry (e.g. `highCut`) now default to that value
  instead of the table's first entry, which for `FREQ_HIGH_CUT` would otherwise default to an
  aggressive `"20Hz"` low-pass. `HIGH_CUT_MAP`/`LOW_CUT_MAP` are removed from the gx1 exports
  (the codec now handles labels directly).

Also: `generate_gx1_patch` and the CLI `new` command now create missing parent directories;
`generate_gx1_patch` upserts into `outPath` by patch name instead of always overwriting the whole
file (new `patchUtils.upsertPatch`); `capabilities.ts` gained missing `DIRECT`/`MANUAL`/etc. params
across several FX types plus new codec↔capabilities drift guards; MCP zod bounds for amp gain,
delay level, reverb tone/preDelay/density, and odds drive/tone now match the device's real ranges.
