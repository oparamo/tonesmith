---
"@tonesmith/mcp": minor
---

The MCP server now advertises onboarding `instructions` at initialize (delivered automatically to
every client): a plain, device-agnostic walkthrough of the discover → describe → generate → inspect
flow, so a connected agent can build patches with no extra context. The server also carries a
display `title`, `description`, and `websiteUrl` in its identity. Separately, the
`generate_gx1_patch` tool description now shows a worked signal-chain example — a partial chain and
the full order it resolves to — guarded against drift from the real merge rule.
