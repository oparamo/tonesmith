---
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Add Vitest coverage for `cli` and `mcp`, previously untested. Both entry points are split so
they're testable in-process: `cli/src/index.ts` now delegates to `buildProgram()` (`program.ts`),
and `mcp/src/index.ts` now delegates to `buildServer()` (`server.ts`). The MCP server's
`version` is read from `mcp/package.json` instead of a hardcoded `"0.1.0"` literal, so it can't
drift from the published version.

Migrate `mcp` from `@modelcontextprotocol/sdk` (v1) to the split v2 beta packages
(`@modelcontextprotocol/server`, `@modelcontextprotocol/client`). This also fixes a real bug: the
v1 SDK's `package.json` `exports` map had no explicit entry for the `server/mcp` and
`server/stdio` subpaths we import as values (only `type` imports, which are erased at compile
time, worked around it) — Node's ESM resolver couldn't resolve them, so the built
`mcp/dist/index.js` failed to start under plain `node` (i.e. `pnpm --filter tonesmith-mcp start`
was broken). The v2 packages export these subpaths explicitly.
