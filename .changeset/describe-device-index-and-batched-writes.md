---
"@tonesmith/mcp": minor
---

Make `describe_device` group listings browsable and let field edits batch.

A group listing inlined every item's full param specs — `describe_device gx1 fx` ran to 70,627
characters across 2,585 lines, large enough that some clients refuse the response, which pushed
consumers into one call per item just to see what exists. A listing is now an index: each item keeps
its id, name, models, description and subtype ids, and the block's own controls stay attached. Pass
`includeParams: true` for the previous full payload, or drill into a single item.

Drilling into an item now also returns the block-level controls that apply to it. Previously
`describe_device gx1 amp JC-120` returned no params at all, because amp's gain/bass/middle/treble
live on the group — the CLI already merged them when printing an item.

`write_field` becomes `write_fields` and takes a `{dot-path: value}` record instead of a single
field/value pair. The whole set applies in memory before anything is written, so a rejected edit
leaves the file untouched instead of half-updated, and one call replaces N read/decode/encode/write
cycles over the same file.
