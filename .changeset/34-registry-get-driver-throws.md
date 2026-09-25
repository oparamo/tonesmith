---
"@tonesmith/core": major
---

`registry.getDriver(id)` throws on an unknown device id, naming the ids that are registered,
instead of returning `undefined`. Every caller had to check the result and write its own message,
and the CLI and the MCP server had each written a different one. Breaking for any caller relying
on the `undefined` return; the now-redundant `requireDriver` is gone.
