---
"@tonesmith/mcp": major
---

One response envelope across the MCP tools, and agent-facing text that names no device.

`read_patch` answers `{ setName, index, patch }`, and its paged form carries each patch as
`{ index, patch }` beside `total`, `offset` and `more`. `generate_patch` reports each saved patch as
`{ name, action, patch }`. The patch is no longer spread across the response's own keys, so a block
named `index` or `setName` cannot shadow what the tool reports, and an agent that reads a patch and
then generates one meets one shape rather than two. The hoisted `chain` is gone from
`generate_patch`, since the echoed patch already carries the order it was stored in.

The tool descriptions and the server's onboarding instructions no longer illustrate themselves with
one device's blocks, params and effect types, which were wrong for every other device. `write_fields`
states the dot-path shape (`<block>.params.<control>`, and `on` / `type` / `subType` on the block)
that every device presents, and the instructions point at `describe_device` for the ids instead of
listing any.
