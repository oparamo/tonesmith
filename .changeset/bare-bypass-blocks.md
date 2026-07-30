---
"@tonesmith/mcp": patch
---

Accept a bare `{ on: false }` on any bypassable generate block (`odds`, `fx1`/`fx2`/`fx3`, `pfx`,
`delay`, `reverb`, `ns`). It previously failed validation demanding `type` and the block's other
required fields, with an error that named a missing field and gave no hint that omitting the block
was the intended move.

A bare bypass is now folded into the omitted case before validation, so it writes bytes identical to
omitting the block rather than being a second code path. That also settles which of the two encodings
of "off" to use: they are the same file either way. Blocks given any other field still require their
full settings, so the schema's `required` hints are unchanged.
