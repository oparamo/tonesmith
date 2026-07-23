---
"@tonesmith/core": minor
"@tonesmith/cli": minor
"@tonesmith/mcp": minor
---

`presentPatch` — the device-agnostic view that hides the redundant `params.type` mirror from
blocks that surface it as `subType` — moves from the MCP server into core (`patchView`), and the
CLI now applies it too: `read` no longer prints `type=<model>` in an fx slot's params line when
the label already shows the model via `subType`. Both presentation surfaces (CLI and MCP) now
share one view of a decoded patch.
