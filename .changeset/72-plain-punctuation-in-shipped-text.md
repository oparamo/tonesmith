---
"@tonesmith/core": patch
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Every em dash is out of the text these packages emit.

The GX-1 capability descriptions carried most of them, and those ship straight through
`describe_device` and the `capabilities` command into what an agent or a player reads. The rest were
in MCP tool descriptions, the server's onboarding instructions, and the error messages both surfaces
raise. Each one is restructured rather than swapped for a shorter dash, so the sentences read the
same way they always did.

Three messages changed shape while their content stayed put: the chain codec's rejection of an
unknown, repeated, or missing block, the CLI's confirmation after `write`, and the MCP
`generate_patch` save summary.
