# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**tonesmith** — TypeScript monorepo toolkit for reading, editing, and building guitar multi-effects
processor patch files. Every device is a self-contained driver behind the same device-agnostic
core, CLI, and MCP surfaces; the docs below describe the shared layer and the per-device pattern,
never one device's internals. Supported devices: **BOSS GX-1** (`gx1`, `.tsl`). New devices are
onboarded with the add-device skill (`.claude/skills/add-device/SKILL.md`).

## Build & dev commands

```bash
pnpm install            # install all workspace deps
pnpm build              # compile all workspaces (core via tsc -b; cli/mcp bundled with tsup)
pnpm lint               # eslint over core, cli, mcp, tools
pnpm test               # run Vitest suites in all workspaces (build first — cli/mcp resolve @tonesmith/core through its built dist/)
pnpm test:watch         # watch mode
pnpm coverage           # tests with coverage thresholds — what CI gates on (build first, as above)
pnpm test:tools         # tests for tools/ scripts (doc-to-md)
pnpm clean              # remove all dist/ directories

# Run the CLI (after pnpm build) — first arg is always the device id:
node cli/dist/index.js <device> read <file>       # e.g. gx1 read fixtures/gx1/rock-tones.tsl

# Run the MCP server (after pnpm build):
pnpm --filter @tonesmith/mcp start

# Convert a documentation source (HTML page or PDF, URL or local file) to Markdown
# (prints to stdout; add -o to write a file; format auto-detected, --format overrides):
pnpm doc-to-md <url|file> [-o out.md] [--format html|pdf]
```

Each device's reverse-engineered binary format spec is `core/docs/<id>/FORMAT.md` — read it before
modifying that device's encode/decode logic. The authoritative reference for a device's parameter
names and value ranges is its captured manual docs, also under `core/docs/<id>/`. Each device's
committed round-trip fixture lives at `fixtures/<id>/`.

## Repository layout

Every `devices/<id>/` directory below follows one fixed per-device shape (gx1 is the current
instance and the structural reference; the add-device skill enforces the shape for new devices).
Adding a device means adding those directories plus one roster line per package — nothing else
in this tree changes.

```text
fixtures/<id>/              one committed real patch-file export per device, in the device's own
                            native format — round-trip baseline shared by core/cli/mcp tests

core/                       @tonesmith/core
  src/
    types/                  device-agnostic type definitions (barrel: types/index.ts)
      patch.ts              Patch, PatchFile, RawPatch
      driver.ts             PatchDriver<T> interface (includes capabilities field)
      capabilities.ts       DeviceCapabilities, CapabilityGroup, CapabilityItem, ParamSpec
    registry.ts             registerDriver / getDriver (throws on unknown id) / listDrivers
    patch-utils.ts          resolvePatchIndices / applyFieldEdits / coerceValue / setByPath
    capability-utils.ts     findGroup / findItem
    devices/index.ts        driver roster — one line per device
    devices/<id>/           per-device driver, always this shape:
      types/                device type definitions split by domain (barrel: index.ts)
      common/               constants.ts (ordered lookup arrays + reverse-index maps) + raw.ts
                            (unique symbol attaching original raw bytes to decoded objects), barrel
      codec/                encode/decode pipeline: primitives → field codecs → per-block codecs →
                            top-level decodePatch/encodePatch composition (barrel: index.ts)
      <format>.ts           file I/O (readFile / writeFile / blankPatch / newFile), named after the
                            device's patch-file format (gx1: tsl.ts)
      builder.ts            high-level patch-construction helpers
      capabilities.ts       the device's full DeviceCapabilities metadata
      driver.ts             PatchDriver<T> object wiring codec + file I/O together
      index.ts              device barrel — driver, patch types, builder helpers
    index.ts                registers the roster; public re-exports + one namespace per device
  tests/                    mirrors src/ — shared-util suites + devices/<id>/ suites (codec
                            round-trip + both capabilities drift guards per device)
    fixtures/<id>/          supplementary per-device fixtures (gx1: default-init.tsl, a
                            factory-default clean baseline complementing the root fixture)
  docs/<id>/                captured manuals as subject-sized Markdown + FORMAT.md (the
                            reverse-engineered binary format spec)

cli/                        @tonesmith/cli  (bin: tonesmith)
  src/
    common/                 device-agnostic pieces (barrel: common/index.ts)
      commands.ts           configureDeviceCommands — shared read / write / copy / new / capabilities
      capabilities-print.ts color printer for DeviceCapabilities
    devices/index.ts        CLI device roster — one CliDescriptor per device
    devices/<id>/           per device: print.ts (patch pretty-printer) + barrel index.ts
                            (descriptor handing driver + printer to the shared commands)
    types/                  CliDescriptor (barrel: types/index.ts)
    program.ts              buildProgram() — assembles the commander program from the roster
    index.ts                bin entry — shebang + buildProgram().parse()
  tests/                    behavior tests (in-process commander, per-command suites)

mcp/                        @tonesmith/mcp  (bin: tonesmith-mcp)
  src/
    common/                 response.ts — ok / err MCP response helpers (barrel: common/index.ts)
    tools/                  generic tool registrations, device-agnostic (barrel: tools/index.ts):
                            list_devices, read_patch, write_field, describe_device
    devices/index.ts        per-device tool roster
    devices/<id>/           per device: generate_<id>_patch tool + its zod schemas
    server.ts               buildServer() — registers generic tools, then the device roster
    index.ts                bin entry — shebang + buildServer() over stdio
  tests/                    behavior tests (MCP InMemoryTransport, per-tool suites)

tools/                      repo tooling — not published, not exposed through MCP; shared
                            tsconfig.json + vitest.config.ts cover every script under tools/
  doc-to-md/                URL or local file → Markdown (HTML or PDF, sniffed from content):
                            index.ts (CLI wiring), convert.ts (detect + convert), fetch.ts (GET bytes)
```

## Architecture

```text
patch file (device-native format)
  → readFile()       parses the device's file envelope, calls decodePatch() on each patch
  → decodePatch()    raw bytes → decoded Patch object (every known block decoded)
  → encodePatch()    Patch → raw bytes (start from the original bytes, overwrite known indices)
  → writeFile()      writes the envelope back to disk
```

**Key design rules** (apply to every device driver):

- **Round-trip byte preservation:** each device's `codec/patch.ts` starts from the original raw
  hex bytes (stashed under the `RAW` symbol) and overwrites only the byte indices it knows.
  Unknown/unused bytes pass through untouched — this prevents file corruption from format fields
  not yet reverse-engineered.

- **Lookup tables:** defined as ordered `const` arrays in the device's `common/constants.ts`; reverse-index maps
  (`AMP_TYPE_IDX`, etc.) are derived with `Object.fromEntries(list.map((v,i) => [v,i]))`.

- **Builder functions:** named after the block they configure, no "set" prefix; scaffolding and
  file-save helpers (gx1's `basePatch`/`clearOdds`/`saveTsl`) are the naming exceptions.
  Setter-style `extra` params are validated against the current type's known fields — an unknown
  key throws rather than being silently written.

- **`write` dot-notation:** `fx1.params.rate=50` walks the decoded patch object; each segment
  after splitting on `.` navigates one level deeper.

Device-specific byte layouts, field names, and value tables do **not** live here — they'd bloat
this file and go stale as devices are added. When you need that detail for a device, read its
`core/docs/<id>/FORMAT.md` (byte-level format spec) and `core/src/devices/<id>/types/` (current
decoded-patch field lists) directly; don't duplicate any of it into this file.

## MCP server tools

| Tool                  | Inputs                                                             | Notes                                                                                                                                                                                                                                                     |
|-----------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `list_devices`        | —                                                                  | Returns `[{ id, name }]`                                                                                                                                                                                                                                  |
| `read_patch`          | `file`, `ref?`                                                     | `ref` = index or name; omit for all patches                                                                                                                                                                                                               |
| `generate_<id>_patch` | device-specific (derived from the device's builder + capabilities) | One tool per device (currently `generate_gx1_patch`): builds a patch via the device's builder and upserts it by patch name into `outPath` (replaces a same-named patch, appends otherwise, creates the file and any missing parent directories if needed) |
| `write_field`         | `file`, `ref`, `field`, `value`                                    | Dot-path mutation, same as CLI `write`                                                                                                                                                                                                                    |
| `describe_device`     | `device`, `group?`, `item?`                                        | Returns capability metadata; omit `group` for all groups, add `item` to drill into one type                                                                                                                                                               |

## CLI capabilities command

```bash
node cli/dist/index.js <device> capabilities                  # list all groups
node cli/dist/index.js <device> capabilities <group>          # every item in one group
node cli/dist/index.js <device> capabilities <group> <item>   # one item's params in detail
```

## Adding a new device

Use the **add-device skill** (`.claude/skills/add-device/SKILL.md`) — the single source of truth
for the full onboarding workflow: documentation capture, binary-format reverse engineering and
`FORMAT.md` write-up, core driver scaffolding, round-trip proof, capabilities + drift guards,
CLI/MCP wiring, and changesets. Don't duplicate its steps here; if the workflow changes, update
the skill.
