---
"@tonesmith/mcp": patch
---

Derive `generate_gx1_patch`'s numeric schema bounds from the param catalog instead of restating
them. Every numeric field's `min`/`max` now comes from the capabilities `ParamSpec` range via new
`boundedNumber`/`boundedInt` helpers, so the schema is a single source of truth with the documented
device range rather than a hand-maintained second copy kept in sync by a test. Validation behavior
is unchanged — all derived bounds match the previous hardcoded ones.

The `schema-drift.test.ts` bounds guard is repurposed accordingly: instead of probing the tool at
each range edge (which can no longer drift), it introspects the wired `inputSchema` and asserts each
field carries a finite bound equal to its catalog range — catching a field left unbounded or mapped
to the wrong / a non-numeric param. A non-numeric range can't parse, so a mis-mapped field fails
loudly at load rather than silently going unbounded.
