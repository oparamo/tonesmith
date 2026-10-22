---
"@tonesmith/mcp": minor
---

The server offers one prompt, `build_patch`, which clients that support prompts show as a slash
command. It takes the `device` (completed from the supported ids as you type), a `description` of
the tone, and the `outPath` to save it in, and hands the agent a request to build that patch. The
agent follows the same two-lookups-and-one-build path the server instructions describe.
