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
