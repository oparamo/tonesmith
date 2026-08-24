# @tonesmith/cli

Command line for guitar multi-effects patch files: read a patch, edit a field, copy one between
files, and browse what a device can do.

## Supported devices

| Device    | id    | Patch file format |
|-----------|-------|-------------------|
| BOSS GX-1 | `gx1` | `.tsl`            |

## Install

```bash
pnpm add -g @tonesmith/cli
```

## Usage

Every command takes the device id first.

```bash
# Start a new file of blank patches at the device's factory defaults
tonesmith <device> new <file> [--set-name <name>] [--count <n>]

# Read every patch in a file, or one by index or name
tonesmith <device> read <file> [index|name]

# Edit fields in place, dot notation for nested ones
tonesmith <device> write <file> <index|name> <field>=<value> ...

# Copy a patch into a slot in another file
tonesmith <device> copy <src> <src_idx|name> <dst> <dst_idx|name>

# Browse the device's capabilities: all groups, one group, or one type
tonesmith <device> capabilities [group] [type]
```

Field paths are the device's own. `read` a patch to see them (the printed fields mirror the
writable paths) and `capabilities` for the valid types and value ranges:

```bash
tonesmith gx1 write my.tsl 0 amp.gain=72 fx1.params.rate=50 fx1.on=true key=G
```

A batch of edits applies as one unit. If any of them names a value the device cannot store, the
whole batch is refused and the file is left as it was.

There is deliberately no `generate` command. Building a patch from a description is what
[`@tonesmith/mcp`](https://www.npmjs.com/package/@tonesmith/mcp) is for, and anyone at a terminal
already has the device's own editor.

## License

MIT. See [LICENSE.md](./LICENSE.md).

The project [README](https://github.com/oparamo/tonesmith#readme) covers the library, the MCP
server, and how a new device is onboarded.
