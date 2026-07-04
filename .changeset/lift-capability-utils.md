---
"@tonesmith/core": patch
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Add `findGroup`/`findItem` to `@tonesmith/core` (`capability-utils.ts`) and use them from both the CLI
`capabilities` command and the MCP `describe_device` tool, replacing duplicated lookup logic. Also
replace `generate_patch`'s hardcoded amp/cab/mic/delay/reverb/wah type catalog with one built from GX-1
capabilities at registration time, so the tool description can't drift from `constants.ts` — this also
fixes the catalog text, which was missing the `USER1`–`USER8` cabinet entries.

Also lift three more pieces of logic duplicated across the CLI and MCP server into `@tonesmith/core`:
- `patchUtils.resolvePatchIndices(patches, ref?)` — one index if `ref` is given, all indices otherwise.
  Used by the CLI `read` command and MCP `read_patch` tool.
- `patchUtils.applyFieldEdits(patch, edits)` — coerce + `setByPath` a batch of dot-path edits. Used by
  the CLI `write` command and MCP `write_field` tool.
- `registry.requireDriver(id)` — `getDriver` or throw a descriptive error. Used by the CLI's device
  dispatch and the MCP server's per-call device validation; `mcp/src/common/driver.ts`'s duplicate
  `requireDriver` is removed.
