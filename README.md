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
pnpm link --global --dir cli   # makes `tonesmith` available in your PATH
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

# Browse device capabilities (all groups / one group / one item)
tonesmith gx1 capabilities [group] [item]
```

### Write examples

```bash
# Amp gain
tonesmith gx1 write my.tsl 0 amp.gain=72

# Multiple fields at once
tonesmith gx1 write my.tsl 0 reverb.level=30 reverb.time=3.0

# FX1 off
tonesmith gx1 write my.tsl 0 fx1.on=false

# Effect parameter
tonesmith gx1 write my.tsl 0 fx1.params.rate=50

# Top-level patch field
tonesmith gx1 write my.tsl 0 key=G
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

| Tool                 | Description                                                    |
|----------------------|----------------------------------------------------------------|
| `list_devices`       | List supported devices                                         |
| `read_patch`         | Read one or all patches from a patch file                      |
| `write_field`        | Edit a single field in an existing patch                       |
| `describe_device`    | Browse a device's capability metadata (groups, types, params)  |
| `generate_gx1_patch` | Build a new GX-1 patch from structured parameters and save it  |

## Generating preset packs

```bash
pnpm --filter @tonesmith/core gen:bad-bunny   # → core/examples/gx1/bad-bunny.tsl  (8 patches)
pnpm --filter @tonesmith/core gen:gilmour     # → core/examples/gx1/gilmour.tsl    (22 patches)
```

Tone descriptions are in `core/examples/gx1/bad-bunny.md` and `core/examples/gx1/gilmour.md`.

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
core/      @tonesmith/core — codec, types, driver registry, GX-1 driver + builder
cli/       @tonesmith/cli  — CLI (tonesmith gx1 read/write/copy/new/capabilities)
mcp/       @tonesmith/mcp  — MCP server (list_devices, read_patch, write_field, describe_device, generate_gx1_patch)

core/examples/gx1/
  bad-bunny.ts / gilmour.ts  preset generators (run with pnpm --filter @tonesmith/core gen:*)
  bad-bunny.md / gilmour.md  tone-library reference docs

tools/doc-to-md/
  index.ts      take a URL or file, convert HTML/PDF to Markdown, print or write it
  convert.ts    format detection (PDF magic bytes) + HTML/PDF → Markdown conversion
  fetch.ts      fetchDocument(url) — plain HTTP GET for bytes with a browser-like User-Agent

fixtures/gx1/
  rock-tones.tsl  real-world fixture for codec round-trip tests (shared by core/cli/mcp tests)

core/docs/gx1/
  FORMAT.md              reverse-engineered TSL binary format
  gx1_parameter_guide.md effect types, parameters, value ranges
  gx1_reference_manual.md hardware operation reference
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

- REST API (`src/api`) + web frontend — future workspaces over `@tonesmith/core`
- Additional devices beyond GX-1
