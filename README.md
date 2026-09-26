# tonesmith

TypeScript toolkit for reading, editing, and building presets for guitar multi-effects
processors. Every device plugs in as a self-contained driver behind the same core library,
CLI, and MCP server, so the surfaces below work identically for any supported device.

tonesmith was built with the help of AI coding tools; [AI_DISCLOSURE.md](AI_DISCLOSURE.md) says how.

## Supported devices

| Device    | id    | Patch file format |
|-----------|-------|-------------------|
| BOSS GX-1 | `gx1` | `.tsl`            |

New devices are onboarded with the `adding-a-device` skill (`.claude/skills/adding-a-device/SKILL.md`),
which walks from format reverse-engineering to CLI/MCP wiring.

## Packages

Three packages, published from this repo. Take the one that matches how you want to work.

| Package                                                            | What it is                                         | Install                      |
|--------------------------------------------------------------------|----------------------------------------------------|------------------------------|
| [`@tonesmith/cli`](https://www.npmjs.com/package/@tonesmith/cli)   | Command line: read a patch, edit a field, copy one | `pnpm add -g @tonesmith/cli` |
| [`@tonesmith/mcp`](https://www.npmjs.com/package/@tonesmith/mcp)   | MCP server, so an agent can build patches for you  | `pnpm add -g @tonesmith/mcp` |
| [`@tonesmith/core`](https://www.npmjs.com/package/@tonesmith/core) | The library the other two are built on             | `pnpm add @tonesmith/core`   |

```bash
tonesmith gx1 read my-tones.tsl   # from @tonesmith/cli
tonesmith-mcp                     # from @tonesmith/mcp, speaks MCP over stdio
```

## Working on tonesmith

```bash
git clone <repo>
cd tonesmith
pnpm install
pnpm build
```

After building, the CLI runs at `node cli/dist/index.js`. For a global alias to the working copy:

```bash
pnpm link --global --dir cli   # makes `tonesmith` available in your PATH
```

## CLI

Every command takes the device id as its first argument:

```bash
# List supported devices (each is a subcommand)
tonesmith --help

# Create a new patch file with N blank patches
tonesmith <device> new <file> [--set-name <name>] [--count <n>]

# Read all patches in a file, or a single patch by index or name
tonesmith <device> read <file> [index|name]

# Edit fields in-place (dot notation for nested fields)
tonesmith <device> write <file> <index|name> <field>=<value> ...

# Copy a patch between files
tonesmith <device> copy <src> <src_idx|name> <dst> <dst_idx|name>

# Browse device capabilities (all groups / one group / one type)
tonesmith <device> capabilities [group] [type]
```

Field paths are device-specific: `read` a patch to see its structure (the printed fields
mirror the writable paths) and use `capabilities` for the valid types and value ranges.
For example, editing a GX-1 patch:

```bash
tonesmith gx1 write my.tsl 0 amp.params.gain=72 fx1.params.rate=50 fx1.on=true key=G
```

Writing a block's `type` switches the effect rather than relabeling it: the block arrives at that
type's factory settings on its factory sub-model, and the controls of the effect it was are gone.
Name the ones you want after the type in the same command, spelled as the new type spells them.

## MCP server

`@tonesmith/mcp` exposes the toolkit as an [MCP](https://modelcontextprotocol.io) server so Claude
(or any MCP client) can read, edit, and generate patches from natural-language descriptions.

The aim is a self-describing device surface. You ask your AI agent for "a patch for my *device*
based on *some song or tone*", the agent works out what that tone needs, then leans on this server
for everything device-specific: the supported devices, their signal blocks, effects, parameters,
and value ranges. The tools carry that knowledge themselves (`describe_device` returns the full set
of parameter keys, ranges, and values; patch generation echoes back the patch it stored), so a
connected agent can build a patch without any extra setup.

```bash
tonesmith-mcp            # installed: runs the server over stdio
node mcp/dist/index.js   # from a working copy, after pnpm build
```

**Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tonesmith": {
      "command": "tonesmith-mcp"
    }
  }
}
```

From a working copy instead, use `"command": "node"` with
`"args": ["/path/to/tonesmith/mcp/dist/index.js"]`.

MCP tools:

| Tool                | Description                                                                                                                      |
|---------------------|----------------------------------------------------------------------------------------------------------------------------------|
| `list_devices`      | List supported devices                                                                                                           |
| `read_patch`        | Read one patch, or page through a whole file                                                                                     |
| `write_fields`      | Edit fields in an existing patch by dot-path, applied as one batch, and rename the patch set                                     |
| `describe_device`   | Look up a device's capability metadata (chain, groups, types, params). `items` takes a list, so one call covers many lookups     |
| `generate_patch`    | Build one or more patches from structured parameters and save them in one write. The per-patch spec comes from `describe_device` |
| `copy_patch`        | Copy a patch into a slot in another file, replacing what was there                                                               |
| `create_patch_file` | Start an empty patch file of blank patches at the device's factory defaults                                                      |

## Converting documentation to Markdown

`tools/doc-to-md` converts one documentation source per run, an HTML page or a PDF, from a URL
or a local file, to Markdown. HTML versus PDF is detected from the content itself; pass
`--format html|pdf` to override.

```bash
pnpm doc-to-md <url>                   # HTML page to Markdown on stdout
pnpm doc-to-md <url> -o out.md         # write to a file instead
pnpm doc-to-md manual.pdf -o out.md    # local PDF manual to Markdown
```

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) covers the layers, the patterns they follow, the repository layout,
and a diagram for how the packages fit and for each package inside.

## Development

```bash
pnpm build        # type-check, then bundle each workspace with tsup (core also emits .d.ts)
pnpm lint         # eslint over core, cli, mcp, tools
pnpm test         # run Vitest suites in all workspaces (build first)
pnpm coverage     # tests with coverage thresholds (what CI gates on)
pnpm clean        # remove dist/ directories
```

## Contributing

The conventions below aren't checked by lint, and they're what makes a change look like it belongs.

**Devices plug in; nothing else changes.** Adding one means a `core/src/device/<id>/` driver, one
roster line, and a fixture. The CLI and the MCP server pick the device up from the core roster, so
neither package gains a file. No entry-point file and no shared module is edited to make room for it. Drivers don't self-register: `core/src/index.ts`
is the composition root and iterates the roster. Consumers call through the `PatchDriver` interface
rather than importing a device's own functions.

**The shared layer stays device-agnostic.** `Patch`, `PatchFile` and `PatchDriver` are the
vocabulary everywhere outside `device/<id>/`. One device's block names and file extension never
reach core's shared modules, the CLI's shared commands, or an MCP tool, in code or in the prose they
carry: an example spelled out of one device's blocks is an example that fails on every other one.

**A device folder publishes two files.** `driver.ts` holds the `PatchDriver<T>` implementation and
nothing else. `index.ts` is the packaging file and the device's entire published surface: the driver,
the patch and block types, and `RAW`. Builders, codec helpers and spec internals stay inside the
folder.

**Every block takes one shape.** A block carries `type` where the device offers one, an optional
`subType` and `on`, and one `params` bag holding its controls. Those three are the reserved
block-level keys; everything else a block has goes under `params`. It is the shape a decoded patch
reads back as, the shape a spec is written in, and the shape a dot-path addresses, so a consumer
learns it once rather than per block.

**Folders are layers named for their role; files are named for their domain.** A folder under `src/`
is a layer (`service/`, `persistence/`, `model/`, a device's `format/`) and imports only the layers
below it, which lint enforces. Folder names are singular. File names are camelCase, spelled like
what they export and never after the type inside them: `patchService.ts`, `builder.ts`, never
`Gx1Driver.ts`. ARCHITECTURE.md lists the layers.

**Exports go at the bottom,** as one trailing `export { … }` / `export type { … }` block, so a file's
public surface reads without skimming the whole file. Barrel files are the exception.

**Names are camelCase and spelled out.** Every variable, parameter and property gets a name that says
what it is: `highCut`, not `high_cut`; `ampParams`, not `a`. The only single letters are generic type
parameters (`T`, `K`, `V`) and a loop index. Compounds on "sub" capitalize the noun: `subType`,
`subTypes`. Builder helpers take the name of what they configure, with no verb prefix: `block()`,
`basePatch()`, not `setBlock()`.

**Dependency versions are exact.** No `^` or `~` in any `package.json`. `pnpm add` writes a range by
default, so correct it after adding.

**Consumer-visible changes need a changeset:** a published package's API, behavior, or output. Tests,
lint config, and repo docs don't.

### Testing

Tests live in each package's `tests/` directory. The practices below come from Meszaros's *xUnit
Test Patterns*, Khorikov's *Unit Testing Principles, Practices, and Patterns*, Beck's *Test
Desiderata* and the Google Testing Blog. Lint enforces the mechanical ones.

1. **One unit per unit suite.** A unit suite sits at the mirror path of one source module
   (`src/service/specService.ts` is tested by `tests/service/specService.test.ts`) and asserts only
   that module's behavior. A collaborator that does I/O, or whose logic is another unit's to test, is
   faked: a fake driver, a hand-written catalog. Pure values such as constants and codec primitives
   may run for real, as long as no assertion is about them.
2. **One behavior per test.** A test has one reason to fail. Several `expect`s are fine when they
   describe one outcome. The test's name states the behavior, so a failure reads without opening the
   test.
3. **Arrange, act, assert,** with one act per test and no loops or conditionals in the body; a table
   of cases is an `it.each`.
4. **Through the public interface.** Assert what a caller can observe, not internals or call order,
   unless the call is the behavior (a file read exactly once).
5. **Isolated and deterministic.** No state shared between tests, no dependence on their order, no
   clock or network, a fresh temp directory per test, and each test fast enough not to notice.
6. **Boundaries covered.** The minimum and maximum, empty input, and the value just past each limit.
7. **Integration tests say so.** A test that crosses units on purpose (a round trip through a
   device's real bytes, conformance across the driver roster, the CLI run end to end, MCP through a
   client) lives in the package's `tests/integration/`, so its scope is plain from its path.
8. **Assert data, never wording.** Check that a rejection names the bad id and lists the valid ones,
   not the sentence it says them in; prose written for agents gets reworded constantly.
9. **Surfaces test their own contract.** `cli` and `mcp` treat `@tonesmith/core` as an external
   library: a surface test earns its place only if it can fail while core is entirely correct.
   Reading a written file back through the driver to check a command's effect qualifies, since
   that fails on a miswiring.
10. **Coverage thresholds are floors, not targets.** They sit well below the measured numbers on
    purpose. Don't write a test to raise them: chasing the last uncovered branch is what produces
    wording assertions.

`pnpm lint`, `pnpm build`, `pnpm test` and `pnpm coverage` should all be green before a pull request.

## Roadmap

Additional devices, onboarded via the adding-a-device skill (`.claude/skills/adding-a-device/SKILL.md`).
