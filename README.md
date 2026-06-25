# tonesmith

TypeScript toolkit for reading, editing, and building presets for guitar multi-effects processors.
Currently implements the **BOSS GX-1** (`.tsl` patch files). Designed to support additional devices.

## Quick start

```bash
git clone <repo>
cd tonesmith
pnpm install
pnpm build
```

After building, the CLI is available at `node cli/dist/index.js`. For a global alias:

```bash
pnpm link --global --dir src/cli   # makes `tonesmith` available in your PATH
```

## CLI

```bash
# List available devices
tonesmith

# Create a new .tsl file with N blank patches
tonesmith gx1 new <file.tsl> [set_name] [n_patches]

# Read all patches in a file
tonesmith gx1 read <file.tsl>

# Read a single patch by index or name
tonesmith gx1 read <file.tsl> <index|name>

# Edit a field in-place (dot notation for nested fields)
tonesmith gx1 write <file.tsl> <index|name> <field>=<value> ...

# Copy a patch between files
tonesmith gx1 copy <src.tsl> <src_idx|name> <dst.tsl> <dst_idx|name>
```

### Write examples

```bash
# Amp gain
tonesmith gx1 write my.tsl 0 amp.gain=72

# Multiple fields at once
tonesmith gx1 write my.tsl 0 reverb.level=30 reverb.time_s=3.0

# FX1 off
tonesmith gx1 write my.tsl 0 fx1.on=false

# Effect parameter
tonesmith gx1 write my.tsl 0 fx1.params.rate=50
```

Field paths: `amp.<field>`, `fx1.params.<field>`, `ns.<field>`, `delay.<field>`, `reverb.<field>`, `fv.<field>`.

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

| Tool | Description |
|---|---|
| `list_devices` | List supported devices |
| `read_patch` | Read one or all patches from a `.tsl` file |
| `generate_patch` | Build a new GX-1 patch from structured parameters and save it |
| `write_field` | Edit a single field in an existing patch |

## Generating preset packs

```bash
pnpm gen:bad-bunny   # → core/examples/gx1/bad-bunny.tsl  (8 patches)
pnpm gen:gilmour     # → core/examples/gx1/gilmour.tsl    (22 patches)
```

Tone descriptions are in `core/examples/gx1/bad-bunny.md` and `core/examples/gx1/gilmour.md`.

## Updating documentation from Roland's site

The parameter guide and reference manual are generated from Roland's online HTML manuals.
To regenerate (requires saving the manual TOC pages locally first):

```bash
# Save the TOC HTML page for each manual to docs/ as shown in tools/html-to-md/gx1.json,
# then run:
pnpm html-to-md:gx1          # regenerate both docs
pnpm html-to-md:gx1 param    # parameter guide only
pnpm html-to-md:gx1 ref      # reference manual only

# Debug a specific page:
pnpm html-to-md tools/html-to-md/gx1.json inspect <url>
```

## Repository layout

```
core/      @tonesmith/core — codec, types, driver registry, GX-1 driver + builder
cli/       @tonesmith/cli  — CLI (tonesmith gx1 read/write/copy/new)
mcp/       @tonesmith/mcp   — MCP server (list_devices, read_patch, generate_patch, write_field)

core/examples/gx1/
  bad-bunny.ts / gilmour.ts  preset generators (run with pnpm gen:*)
  bad-bunny.md / gilmour.md  tone-library reference docs

tools/html-to-md/
  index.ts      generic HTML-manual → Markdown converter (configurable selectors)
  gx1.json      Roland GX-1 specific config

core/tests/fixtures/gx1/
  rock-tones.tsl  real-world fixture for codec round-trip tests

core/docs/gx1/
  FORMAT.md              reverse-engineered TSL binary format
  gx1_parameter_guide.md effect types, parameters, value ranges
  gx1_reference_manual.md hardware operation reference
```

## Development

```bash
pnpm build        # compile all workspaces (tsc -b)
pnpm test         # run Vitest codec round-trip tests
pnpm clean        # remove dist/ directories
```

## Roadmap

- REST API (`src/api`) + web frontend — future workspaces over `@tonesmith/core`
- Additional devices beyond GX-1
