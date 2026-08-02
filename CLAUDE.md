# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**tonesmith** is a TypeScript monorepo toolkit for reading, editing, and building guitar
multi-effects processor patch files. Every device is a self-contained driver behind the same
device-agnostic core, CLI, and MCP surfaces; the docs below describe the shared layer and the
per-device pattern, never one device's internals. Supported devices: **BOSS GX-1** (`gx1`, `.tsl`).
New devices are onboarded with the add-device skill (`.claude/skills/add-device/SKILL.md`).

## Build & dev commands

```bash
pnpm install            # install all workspace deps
pnpm build              # type-check, then bundle each workspace with tsup (core also emits .d.ts)
pnpm lint               # eslint over core, cli, mcp, tools
pnpm test               # Vitest suites in all workspaces (build first: cli/mcp resolve @tonesmith/core through its built dist/)
pnpm test:watch         # watch mode
pnpm coverage           # tests with coverage thresholds, what CI gates on (build first, as above)
pnpm test:tools         # tests for tools/ scripts (doc-to-md)
pnpm clean              # remove all dist/ directories

# Run the CLI (after pnpm build). The first arg is always the device id:
node cli/dist/index.js <device> read <file>       # e.g. gx1 read fixtures/gx1/rock-tones.tsl

# Run the MCP server (after pnpm build):
pnpm --filter @tonesmith/mcp start

# Convert a documentation source (HTML page or PDF, URL or local file) to Markdown
# (prints to stdout; add -o to write a file; format auto-detected, --format overrides):
pnpm doc-to-md <url|file> [-o out.md] [--format html|pdf]
```

Each device's reverse-engineered binary format spec is `core/docs/<id>/FORMAT.md`. Read it before
modifying that device's encode/decode logic. The authoritative reference for a device's parameter
names and value ranges is its captured manual docs, also under `core/docs/<id>/`. Each device's
committed round-trip fixture lives at `fixtures/<id>/`.

## Repository layout

Every `devices/<id>/` directory below follows one fixed per-device shape (gx1 is the current
instance and the structural reference; the add-device skill enforces the shape for new devices).
Adding a device means adding those directories plus one roster line per package. Nothing else in
this tree changes.

```text
fixtures/<id>/              one committed real patch-file export per device, in the device's own
                            native format: the round-trip baseline shared by core/cli/mcp tests

core/                       @tonesmith/core
  src/
    types/                  device-agnostic type definitions (barrel: types/index.ts)
      patch.ts              Patch, PatchFile, RawPatch
      driver.ts             PatchDriver<T> interface (includes capabilities field)
      capabilities.ts       DeviceCapabilities, CapabilityGroup, CapabilityItem, ParamSpec
    registry.ts             registerDriver / getDriver (throws on unknown id) / listDrivers
    patch-utils.ts          patch-file operations every surface shares: resolvePatchIndices,
                            applyFieldEdits, coerceValue, setByPath, upsertPatches, copyPatch,
                            createPatchFile
    patch-view.ts           presentPatch: the consumer-facing view of a decoded patch, dropping
                            the model selector that decode mirrors onto both subType and
                            params.type so a consumer isn't left guessing which to set
    capability-utils.ts     findGroup / findItem
    devices/index.ts        driver roster, one line per device
    devices/<id>/           per-device driver, always this shape:
      types/                device type definitions split by domain (barrel: index.ts)
      common/               constants.ts (ordered lookup arrays + reverse-index maps) + raw.ts
                            (unique symbol attaching original raw bytes to decoded objects), barrel
      codec/                encode/decode pipeline: primitives, then field codecs, then per-block
                            codecs, then top-level decodePatch/encodePatch (barrel: index.ts)
      <format>.ts           file I/O (readFile / writeFile / blankPatch / newFile), named after the
                            device's patch-file format (gx1: tsl.ts)
      builder.ts            high-level patch-construction helpers
      defaults.ts           each block type's real factory defaults, harvested from a
                            factory-default export; the builder fills unset params from here
      param-domain.ts       the value domains a ParamSpec derives from, so a param's human range
                            string, machine value list, and numeric bounds are authored once
      param-catalog.ts      per block/type param surface (name + range + description), the
                            in-repo param ground truth; capabilities derives from it and the
                            codec-to-catalog drift guard checks against it
      capabilities.ts       the device's DeviceCapabilities metadata (structure/models/subtypes;
                            each item's params come from param-catalog.ts)
      driver.ts             PatchDriver<T> object wiring codec + file I/O together
      index.ts              device barrel: driver, patch types, builder helpers
    index.ts                registers the roster; public re-exports + one namespace per device
  tests/                    mirrors src/: shared-util suites + devices/<id>/ suites (codec
                            round-trip, plus the codec-to-catalog and defaults drift guards)
    fixtures/<id>/          supplementary per-device fixtures (gx1: default-init.tsl, a
                            factory-default clean baseline complementing the root fixture)
  docs/<id>/                captured manuals as subject-sized Markdown + FORMAT.md (the
                            reverse-engineered binary format spec)

cli/                        @tonesmith/cli  (bin: tonesmith)
  src/
    common/                 device-agnostic pieces (barrel: common/index.ts)
      commands.ts           configureDeviceCommands: shared read / write / copy / new /
                            capabilities, one registrar per command
      capabilities-print.ts color printer for DeviceCapabilities
    devices/index.ts        CLI device roster, one CliDescriptor per device
    devices/<id>/           per device: print.ts (patch pretty-printer) + barrel index.ts
                            (descriptor handing driver + printer to the shared commands)
    types/                  CliDescriptor (barrel: types/index.ts)
    program.ts              buildProgram(), assembling the commander program from the roster
    index.ts                bin entry: shebang + buildProgram().parse()
  tests/                    behavior tests (in-process commander, per-command suites)

mcp/                        @tonesmith/mcp  (bin: tonesmith-mcp)
  src/
    common/                 response.ts, the ok / err MCP response helpers (barrel: common/index.ts)
    instructions.ts         server-onboarding text sent to every client at initialize, written as
                            the two-call path for building patches rather than a tool inventory
    tools/                  generic tool registrations, device-agnostic (barrel: tools/index.ts):
                            list_devices, read_patch, write_fields, describe_device, copy_patch,
                            create_patch_file
    devices/index.ts        per-device tool roster
    devices/<id>/           per device: the generate_<id>_patch tool, its zod schemas, the
                            param-ref bridge that reads bounds and descriptions off the catalog,
                            param validation, and the capability-derived type text in its
                            description
    server.ts               buildServer(), registering generic tools then the device roster
    index.ts                bin entry: shebang + buildServer() over stdio
  tests/                    behavior tests (MCP InMemoryTransport, per-tool suites)

tools/                      repo tooling, not published and not exposed through MCP; a shared
                            tsconfig.json + vitest.config.ts cover every script under tools/
  doc-to-md/                URL or local file to Markdown (HTML or PDF, sniffed from content):
                            index.ts (CLI wiring), convert.ts (detect + convert), fetch.ts (GET bytes)
```

## Architecture

```text
patch file (device-native format)
  → readFile()       parses the device's file envelope, calls decodePatch() on each patch
  → decodePatch()    raw bytes to a decoded Patch object (every known block decoded)
  → encodePatch()    Patch to raw bytes (start from the original bytes, overwrite known indices)
  → writeFile()      writes the envelope back to disk
```

**Key design rules** (apply to every device driver):

- **Round-trip byte preservation:** each device's `codec/patch.ts` starts from the original raw
  hex bytes (stashed under the `RAW` symbol) and overwrites only the byte indices it knows.
  Unknown and unused bytes pass through untouched, which prevents file corruption from format
  fields not yet reverse-engineered.

- **Lookup tables:** defined as ordered `const` arrays in the device's `common/constants.ts`;
  reverse-index maps (`AMP_TYPE_IDX`, etc.) are derived with
  `Object.fromEntries(list.map((v,i) => [v,i]))`.

- **Builder functions:** named after the block they configure, no "set" prefix; scaffolding and
  file-save helpers (gx1's `basePatch` and `saveTsl`) are the naming exceptions. Each takes the
  patch plus one options object, and any block whose params vary by type carries them in a
  `params` bag. That bag is validated against the current type's known fields, so an unknown key
  throws rather than silently writing a byte that means something else for this type.

- **`write` dot-notation:** `fx1.params.rate=50` walks the decoded patch object; each segment
  after splitting on `.` navigates one level deeper.

Device-specific byte layouts, field names, and value tables do **not** live here. They would bloat
this file and go stale as devices are added. When you need that detail for a device, read its
`core/docs/<id>/FORMAT.md` (byte-level format spec) and `core/src/devices/<id>/types/` (current
decoded-patch field lists) directly; don't duplicate any of it into this file.

## Conventions

Decisions that tooling can't check and that are expensive to relitigate. The mechanical rules are
already errors in `eslint.config.js` (at most three parameters, no duplicate function bodies, no em
dashes, ternaries assigned before use, cognitive complexity 10), so they are not repeated here.

- **`print.ts` stays hand-written per device.** Driving it off `capabilities` reads as the obvious
  refactor and isn't one: a generic loop trades deliberate grouping and ordering for an
  alphabetical field dump, and the only consumer is a person reading a terminal. Agents read the
  same capability data through MCP already.
- **`param-catalog.ts`, `capabilities.ts`, and `types/` are three views of one truth**, not
  triplication to collapse. The catalog is the param ground truth, capabilities is the structure an
  agent browses, the types are the decoded shape. The drift guards
  (`core/tests/devices/<id>/capabilities.test.ts`, `mcp/tests/schema-drift.test.ts`, and the
  defaults guard) are what let the three coexist, so they stay even when other defensive tests go.
- **Tests assert the data a message carries, never its wording.** Assert that a rejection names the
  bad id and lists the valid ones; don't assert the sentence it says them in. Prose written for
  agents gets reworded constantly, and a wording assertion turns every such edit into a test edit.
- **Coverage thresholds are floors, not targets.** They sit well below the measured numbers
  deliberately. Don't write tests to raise them, and don't ratchet them toward what the suite
  currently scores: chasing the last uncovered branch is what produced the wording assertions above.
- **Comments earn their line by explaining why.** The constraint that forced this shape, the bug it
  prevents, the reason the obvious approach fails. A comment restating the code teaches nothing and
  goes stale on the next edit. Match the comment density of the file you're already in.
- **Dependency versions are exact.** No `^` or `~` in any `package.json`. `pnpm add` writes a range
  by default, so correct it after adding.
- **Changesets cover consumer-visible changes only:** a published package's API, behavior, or
  output. Tests, lint config, and repo docs don't get one.
- **Verify agent-facing changes through MCP, not the CLI.** Both surfaces render the same data
  through different code, so a CLI check proves nothing about what an agent receives. An MCP client
  keeps running the server binary it started with, so a rebuild needs a client reconnect before a
  live call means anything.
- **Patch generation is MCP-only.** The CLI deliberately has no `generate` command: building a
  patch from a description is the job an agent does, and the CLI's users already have the device's
  own editor for that.

The repository is written against two general craft skills, `typescript-clean-code` and
`anti-slop-writing`. Neither is committed here: they aren't repository knowledge, and a vendored
copy drifts from the original. `add-device` is committed, since its workflow is specific to this
repository.

## MCP server tools

| Tool                  | Inputs                                                             | Notes                                                                                                                                                                                                                                                     |
|-----------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `list_devices`        | none                                                               | Returns `[{ id, name }]`                                                                                                                                                                                                                                  |
| `read_patch`          | `device`, `file`, `ref?`                                           | `ref` = index or name; omit for all patches                                                                                                                                                                                                               |
| `generate_<id>_patch` | `outPath`, `setName?`, `patches[]` (per-patch spec is device-specific, derived from the device's builder + capabilities) | One tool per device (currently `generate_gx1_patch`): builds every patch in `patches` and upserts them by name into `outPath` in array order, in one file write (replaces a same-named patch, appends otherwise, creates the file and any missing parent directories if needed). The response echoes each patch complete with defaults plus its resolved chain, so no follow-up read is needed |
| `write_fields`        | `device`, `file`, `ref`, `fields`                                  | Dot-path mutations as a `{path: value}` record, same as CLI `write`. The batch applies atomically: a rejected edit leaves the file untouched                                                                                                              |
| `describe_device`     | `device`, `items?`, `includeParams?`                               | Returns capability metadata. `items` is a list, so one call covers a whole patch's lookups: each entry is `"chain"`, a group id (`"amp"`), or `"<group>/<item>"` (`"fx/CHORUS"`, split on the first slash so `"fx/OD/DS"` works). Omit `items` for all groups plus a chain summary. A bare-group entry is an index with no per-item params, so name the items instead, or pass `includeParams` for the full set. One bad entry fails the whole call |
| `copy_patch`          | `device`, `src`, `srcRef`, `dst`, `dstRef`                         | Copies one patch into a slot in another file, replacing what was there. Both files must already exist. To add a patch without displacing one, use the device's generate tool, which appends by name                                                        |
| `create_patch_file`   | `device`, `file`, `setName?`, `patchCount?`                        | Starts an empty file of blank patches at the device's factory defaults. Never overwrites an existing file. Not part of building a patch from parameters: the generate tool creates its own output file                                                     |

## CLI capabilities command

```bash
node cli/dist/index.js <device> capabilities                  # list all groups
node cli/dist/index.js <device> capabilities <group>          # every item in one group
node cli/dist/index.js <device> capabilities <group> <item>   # one item's params in detail
```

## Adding a new device

Use the **add-device skill** (`.claude/skills/add-device/SKILL.md`), the single source of truth for
the full onboarding workflow: documentation capture, binary-format reverse engineering and
`FORMAT.md` write-up, core driver scaffolding, round-trip proof, capabilities + drift guards,
CLI/MCP wiring, and changesets. Don't duplicate its steps here; if the workflow changes, update
the skill.
