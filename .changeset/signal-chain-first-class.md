---
"@tonesmith/core": minor
"@tonesmith/cli": minor
"@tonesmith/mcp": minor
---

The signal chain is now a first-class concept. `DeviceCapabilities` carries a `chain` model
(`ChainSpec`: `description` + `defaultOrder`) that `describe_device <device> chain` and the CLI
`capabilities <device> chain` surface as their own view, and the rewritten MCP server instructions
direct a connected agent to learn the chain first. The no-group `describe_device` response now
returns `{ chain, groups }` — a lean chain pointer alongside the group summaries — instead of a bare
groups array.

Every block builder can now set its own on/off state: `amp()`, `fx()`, and `odds()` gained an `on`
parameter (default true), so `generate_gx1_patch` bypasses any block (except FV, which is always
active) uniformly via `on: false` — closing a gap where OD/DS could only be disabled by omission.
The generate tool no longer flips fx slots off after the fact, its per-block descriptions defer the
chain rules to the chain view, and its default chain order is derived from the builder's
`DEFAULT_CHAIN` so it can't drift. The now-redundant `clearOdds` helper was removed.
