---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
---

Three agent-facing MCP improvements found while dogfooding patch generation.

**Name the patch set.** `generate_gx1_patch` takes an optional `setName` — the name of the
patch set/library stored in the file (distinct from `outPath`, the filename on disk, and from
`name`, the individual patch name). Without it, behavior is unchanged: a new file is named after
the first patch, and an existing file keeps its name. `patchUtils.upsertPatch` gains a matching
optional `setName` argument (device-agnostic): when provided it names a freshly created set and
renames an existing one; when omitted the prior default holds.

**Hide the redundant `params.type` mirror.** Effects whose model selector is stored in
`params.type` (COMPRESSOR, DELAY sub-algorithms, etc.) surface that same value as `subType`, so
both appeared in `read_patch` and `generate_gx1_patch` output — leaving an agent unsure which to
set. A new `presentPatch` view drops `params.type` from any block where it exactly mirrors
`subType`, applied to both tools' serialized output. `subType` is now the single selector an
agent sees. The codec, byte round-trip, and internal source of truth are unchanged.

**Per-type param validation.** A single catalog-driven validator (`validateTypeParams`) checks
every supplied value against the chosen effect type's real range — numeric params by their
per-type `min`/`max`, discrete params by their value list — and is applied uniformly across
`delay`, `reverb`, `fx1`/`fx2`/`fx3`, and `pfx`. Previously the flat schema bounded delay/reverb
by a single representative type and left the `params` bags unchecked (only the codec's raw byte
guard caught anything). A value outside the chosen type's range (e.g. `ANALOG` `timeMs: 1201`,
past its 1200 ms limit) is now rejected up front with a clear message instead of being written
as an unknown-to-the-device byte.
