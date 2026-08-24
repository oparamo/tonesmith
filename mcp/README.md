# @tonesmith/mcp

An [MCP](https://modelcontextprotocol.io) server that carries the device knowledge an agent needs
to read, edit, and build patches for guitar multi-effects processors.

Ask your agent for "a patch for my *device* based on *some song or tone*". The agent works out what
that tone needs; everything device-specific comes from here: the supported devices, their signal
blocks, effects, parameters, and value ranges. No extra setup, and nothing for the agent to look up
elsewhere.

## Supported devices

| Device    | id    | Patch file format |
|-----------|-------|-------------------|
| BOSS GX-1 | `gx1` | `.tsl`            |

## Install

```bash
pnpm add -g @tonesmith/mcp
tonesmith-mcp   # runs over stdio
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tonesmith": {
      "command": "tonesmith-mcp"
    }
  }
}
```

## Tools

| Tool                | Description                                                                                                                     |
|---------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `list_devices`      | List supported devices                                                                                                          |
| `describe_device`   | A device's capability metadata (chain, groups, types, params). `items` takes a list, so one call covers a whole patch's lookups  |
| `generate_patch`    | Build one or more patches from structured parameters and save them in one write. The per-patch spec comes from `describe_device` |
| `read_patch`        | Read one patch, or page through a whole file                                                                                    |
| `write_fields`      | Edit fields in an existing patch, applied as one batch                                                                          |
| `copy_patch`        | Copy a patch into a slot in another file, replacing what was there                                                              |
| `create_patch_file` | Start an empty file of blank patches at the device's factory defaults                                                           |

Building a patch is two lookups and one build, however many patches are involved: one
`describe_device` with no `items` to see every group and type the device has, one naming the types
needed, then one `generate_patch`. The generate response echoes each patch complete with defaults
and its resolved chain, so nothing has to be read back to confirm it.

A device's blocks, types and params live in `describe_device` rather than in any tool's schema, so
`describe_device` is always the call that answers "what can this device do".

## License

MIT. See [LICENSE.md](./LICENSE.md).

The project [README](https://github.com/oparamo/tonesmith#readme) covers the library, the CLI, and
how a new device is onboarded.
