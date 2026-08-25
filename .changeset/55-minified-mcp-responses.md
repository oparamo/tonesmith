---
"@tonesmith/mcp": patch
---

MCP tool responses are now minified.

Every one of these responses is JSON read by an agent, never by hand, so the indented output was
spending bytes nothing benefited from. Size also has a failure mode here: a client that persists an
oversized tool result to a file, then refuses to read that file back for exceeding the same limit,
turns one large lookup into a call the caller cannot recover. A 30-entry `describe_device` batch,
the scale the server's own instructions tell agents to work in, returned 57.3 KB and hit exactly
that. The same batch is now 34.2 KB.

Response content is unchanged.
