---
"@tonesmith/mcp": minor
---

`generate_gx1_patch` now confirms the resolved signal chain explicitly: the response summary
includes a `chain resolved as: ["PFX",…,"REV"]` line, and the `chain` input description explains
that omitted blocks appear at their default positions (disable a block via `on`, not by leaving
it out of `chain`). Previously a caller passing a partial chain had to infer from the expanded
`chain` array whether its reorder was honored.
