---
"@tonesmith/core": minor
---

`messageOf(error)` reads the message out of anything thrown, an `Error` or any other value, so a
consumer reporting a failed call never shows "[object Object]". The CLI and the MCP server use it
rather than keeping copies of their own.
