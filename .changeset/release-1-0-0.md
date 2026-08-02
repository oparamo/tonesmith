---
"@tonesmith/core": major
"@tonesmith/cli": major
"@tonesmith/mcp": major
---

First stable release. The public API of all three packages is frozen from here, and the entries
below are what a 0.2.0 consumer needs to know about.

The shape that settled: one device-agnostic core carrying the patch model, the file operations and
the driver registry, with each device a self-contained driver behind `PatchDriver<T>`. The CLI and
the MCP server are transports over that core rather than places logic lives, so a device reaches
both surfaces by registering one driver. BOSS GX-1 is the device that ships.

Round-trip byte preservation is the guarantee underneath all of it. Encoding starts from the bytes
a file already held and overwrites only the indices the codec knows, so format fields nobody has
reverse engineered yet survive a read and write cycle untouched.

`@tonesmith/mcp` now depends on `@modelcontextprotocol/server` 2.0.0, the stable release of the
split v2 packages. That fixes a bug which made the published binary unusable: the v1 SDK's
`exports` map had no entry for the `server/mcp` and `server/stdio` subpaths the server imports as
values, so Node's ESM resolver could not resolve them and `tonesmith-mcp` failed to start under
plain `node`. The server also reports its real package version at initialize rather than a
hardcoded `0.1.0`.
