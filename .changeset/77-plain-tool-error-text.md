---
"@tonesmith/mcp": minor
---

A tool error's text is the failure's message alone, with no `Error: ` prefix: a thrown error
reaches the client through the MCP SDK's own error response, flagged `isError`.
