# @tonesmith/cli

[![npm](https://img.shields.io/npm/v/@tonesmith/cli)](https://www.npmjs.com/package/@tonesmith/cli)
[![license](https://img.shields.io/npm/l/@tonesmith/cli)](./LICENSE.md)
[![node](https://img.shields.io/node/v/@tonesmith/cli)](https://nodejs.org)

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
tonesmith gx1 write my.tsl 0 amp.params.gain=72 fx1.params.rate=50 fx1.on=true key=G
```

A batch of edits applies as one unit. If any of them names a value the device cannot store, the
whole batch is refused and the file is left as it was.

Writing a block's `type` switches the effect rather than relabeling it: the block arrives at that
type's factory settings on its factory sub-model, and the controls of the effect it was are gone.
Name the ones you want after the type in the same command, spelled as the new type spells them.

There is deliberately no `generate` command. Building a patch from a description is what
[`@tonesmith/mcp`](https://www.npmjs.com/package/@tonesmith/mcp) is for, and anyone at a terminal
already has the device's own editor.

## License

MIT. See [LICENSE.md](./LICENSE.md).

The project [README](https://github.com/oparamo/tonesmith#readme) covers the library, the MCP
server, and how a new device is onboarded.
