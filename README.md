# tonesmith

TypeScript toolkit for reading, editing, and building presets for guitar multi-effects
processors. Every device plugs in as a self-contained driver behind the same core library,
CLI, and MCP server — the surfaces below work identically for any supported device.

## Supported devices

| Device    | id    | Patch file format |
|-----------|-------|-------------------|
| BOSS GX-1 | `gx1` | `.tsl`            |

New devices are onboarded with the `add-device` skill (`.claude/skills/add-device/SKILL.md`),
which walks from format reverse-engineering to CLI/MCP wiring.

## Quick start

```bash
git clone <repo>
cd tonesmith
pnpm install
pnpm build
```

After building, the CLI is available at `node cli/dist/index.js`. For a global alias:

```bash
pnpm link --global --dir cli   # makes `tonesmith` available in your PATH
```

## CLI

Every command takes the device id as its first argument:

```bash
# List available devices
tonesmith

# Create a new patch file with N blank patches
tonesmith <device> new <file> [set_name] [n_patches]

# Read all patches in a file, or a single patch by index or name
tonesmith <device> read <file> [index|name]

# Edit fields in-place (dot notation for nested fields)
tonesmith <device> write <file> <index|name> <field>=<value> ...

# Copy a patch between files
tonesmith <device> copy <src> <src_idx|name> <dst> <dst_idx|name>

# Browse device capabilities (all groups / one group / one item)
tonesmith <device> capabilities [group] [item]
```

Field paths are device-specific: `read` a patch to see its structure (the printed fields
mirror the writable paths) and use `capabilities` for the valid types and value ranges.
For example, editing a GX-1 patch:

```bash
tonesmith gx1 write my.tsl 0 amp.gain=72 fx1.params.rate=50 fx1.on=true key=G
```

## MCP server

`@tonesmith/mcp` exposes the toolkit as an [MCP](https://modelcontextprotocol.io) server so Claude
(or any MCP client) can read, edit, and generate patches from natural-language descriptions.

```bash
node mcp/dist/index.js   # runs the server over stdio
```

**Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tonesmith": {
      "command": "node",
      "args": ["/path/to/tonesmith/mcp/dist/index.js"]
    }
  }
}
```

MCP tools:

| Tool                  | Description                                                                                         |
|-----------------------|-----------------------------------------------------------------------------------------------------|
| `list_devices`        | List supported devices                                                                              |
| `read_patch`          | Read one or all patches from a patch file                                                           |
| `write_field`         | Edit a single field in an existing patch                                                            |
| `describe_device`     | Browse a device's capability metadata (groups, types, params)                                       |
| `generate_<id>_patch` | Build a new patch from structured parameters — one tool per device (currently `generate_gx1_patch`) |

## Converting documentation to Markdown

`tools/doc-to-md` converts one documentation source per run — an HTML page or a PDF, from a URL
or a local file — to Markdown. HTML vs PDF is detected from the content itself; pass
`--format html|pdf` to override.

```bash
pnpm doc-to-md <url>                   # HTML page → Markdown on stdout
pnpm doc-to-md <url> -o out.md         # write to a file instead
pnpm doc-to-md manual.pdf -o out.md    # local PDF manual → Markdown
```

## Repository layout

```tree
core/            @tonesmith/core — device-agnostic types, registry, and utils; one driver per device under src/devices/<id>/
cli/             @tonesmith/cli  — shared device-agnostic commands; one thin printer/descriptor per device under src/devices/<id>/
mcp/             @tonesmith/mcp  — generic MCP tools; one generate tool per device under src/devices/<id>/
tools/           repo tooling (doc-to-md); not published
fixtures/<id>/   one committed real patch-file export per device — the round-trip test baseline
core/docs/<id>/  captured device documentation + FORMAT.md, the reverse-engineered format spec
```

## Development

```bash
pnpm build        # compile all workspaces (core via tsc -b; cli/mcp bundled with tsup)
pnpm lint         # eslint over core, cli, mcp, tools
pnpm test         # run Vitest suites in all workspaces (build first)
pnpm coverage     # tests with coverage thresholds (what CI gates on)
pnpm clean        # remove dist/ directories
```

## Roadmap

- REST API + web frontend — future workspaces over `@tonesmith/core`
- Additional devices
