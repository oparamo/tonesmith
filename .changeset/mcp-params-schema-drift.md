---
"@tonesmith/mcp": patch
---

Fix `generate_patch`'s `params`/`extra` schemas (pfx, fx1/fx2/fx3, delay) rejecting the many GX-1
effect parameters that select a model or mode by name rather than by number — e.g. pedal WAH's and
FIXED WAH's `wahType`, TOUCH WAH/AUTO WAH's `filter`, SLICER's `pattern`, HARMONIST's `harmony`,
delay TWIST's `mode`, and SPACE ECHO's `head`. These fields are `lookup()`-encoded strings in the
codec, but the schemas were `z.record(z.string(), z.number())`, so `generate_patch` could never
build a working patch using any of them. Widened the affected record value types to
`z.union([z.string(), z.number()])` and corrected the pfx WAH doc-string example
(`{ wahType: 0 }` → `{ wahType: "CRY WAH" }`).
