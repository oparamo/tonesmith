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

Each device's reverse-engineered binary format spec is `core/docs/<id>/FORMAT.md`. **Read it first
and treat it as the answer.** It is written from the device's own official parameter tables, not
inferred from sample files, so its offsets, field widths and value tables are the device's own
numbers. Anything you would otherwise go digging through vendor material for should already be in
there; if it isn't, or it disagrees with the code, that is a gap in FORMAT.md worth fixing rather
than a reason to keep re-deriving it elsewhere.

The captured manual docs alongside it, also under `core/docs/<id>/`, cover what the parameters
*mean*: what a control does, what it sounds like, how the device is operated. Use them for prose and
intent, and FORMAT.md for numbers.

Each device's committed round-trip fixture lives at `fixtures/<id>/`.

## Repository layout

Every `devices/<id>/` directory below follows one fixed per-device shape (gx1 is the current
instance and the structural reference; the add-device skill enforces the shape for new devices).
Adding a device means adding that directory plus one line in the core roster. The CLI and the MCP
server read that roster, so nothing else in this tree changes.

```text
fixtures/<id>/              one committed real patch-file export per device, in the device's own
                            native format: the round-trip baseline shared by core/cli/mcp tests

core/                       @tonesmith/core
  src/
    types/                  device-agnostic type definitions (barrel: types/index.ts)
      patch.ts              Patch, PatchFile, RawPatch
      driver.ts             PatchDriver<T> interface (includes capabilities field)
      capabilities.ts       DeviceCapabilities, CapabilityGroup, CapabilityType, ParamSpec
      view.ts               PatchView / BlockView / PatchDetail: a patch as a person reads it,
                            composed by the driver and rendered by whoever displays it
    registry.ts             registerDriver / getDriver (throws on unknown id) / listDrivers
    patch-utils.ts          patch-file operations every surface shares: resolvePatch /
                            resolvePatches, upsertPatches, copyPatch, createPatchFile. Editing a
                            patch is not among them: what a dot-path means is the driver's
    capability-utils.ts     findGroup / findType
    atomic-write.ts         writeFileAtomic: sibling file then rename, so a driver's writeFile can
                            never truncate a patch library it fails partway through
    devices/index.ts        driver roster, one line per device
    devices/<id>/           per-device driver, always this shape:
      types/                device type definitions split by domain (barrel: index.ts)
      common/               constants.ts (ordered lookup arrays + reverse-index maps), blocks.ts
                            (which blocks a spec may name, and where each keeps its controls, read
                            by both the spec validator and capabilities), raw.ts (unique symbol
                            attaching original raw bytes to decoded objects), barrel
      codec/                encode/decode pipeline: primitives, then field codecs, then per-block
                            codecs, then top-level decodePatch/encodePatch (barrel: index.ts)
      <format>.ts           file I/O (readFile / writeFile / blankPatch / newFile), named after the
                            device's patch-file format (gx1: tsl.ts)
      builder.ts            high-level patch-construction helpers
      defaults.ts           each block type's real factory defaults, harvested from a
                            factory-default export; the builder fills unset params from here
      param-domain.ts       the value domains a ParamSpec derives from, so a param's human range
                            string, machine value list, and numeric bounds are authored once
      param-catalog.ts      per block/type param surface (name + range + description) plus the
                            patch's own settings, the in-repo param ground truth; capabilities
                            derives from it and the codec-to-catalog drift guard checks against it
      capabilities.ts       the device's DeviceCapabilities metadata (structure/models/subtypes;
                            each type's params come from param-catalog.ts)
      driver.ts             PatchDriver<T> object wiring codec + file I/O together
      view.ts               the device's blocks in reading order, under its own panel labels,
                            behind PatchDriver.viewPatch
      spec/                 validates a patch spec against the device's own capability catalog and
                            builds it: validate.ts checks blocks, types and values; errors.ts
                            composes the rejection messages; build.ts assembles the validated spec
                            via builder.ts (barrel: index.ts). Backs PatchDriver.buildPatch.
                            paths.ts + edits.ts are the dot-path edit surface behind
                            PatchDriver.applyEdits: where a path lands, and whether what landed
                            is something the device can store
      index.ts              device barrel, and the whole published surface for the device: driver,
                            patch and block types, RAW. Nothing else leaves the device folder
    index.ts                registers the roster; public re-exports + one namespace per device
  tests/                    mirrors src/: shared-util suites + devices/<id>/ suites (codec
                            round-trip, plus the codec-to-catalog and defaults drift guards)
    helpers.ts              fixture paths and contents off one anchor, `present`, and
                            scratchDir / scratchFile, which register their own cleanup hooks. Named
                            apart from cli's and mcp's withTempDir, which return a manual `cleanup`
    fixtures/<id>/          supplementary per-device fixtures (gx1: default-init.tsl, a
                            factory-default clean baseline complementing the root fixture)
  docs/<id>/                captured manuals as subject-sized Markdown + FORMAT.md (the
                            reverse-engineered binary format spec)

cli/                        @tonesmith/cli  (bin: tonesmith)
  src/
    common/                 every piece of the CLI, all device-agnostic (barrel: common/index.ts)
      commands.ts           configureDeviceCommands: shared read / write / copy / new /
                            capabilities, one registrar per command
      capabilities-print.ts color printer for DeviceCapabilities
      patch-print.ts        color printer for a driver's PatchView, so a device ships with no CLI
                            code of its own
      color.ts              the SGR constants both printers share, and the one gate that turns
                            them off when stdout is not a terminal
    program.ts              buildProgram(), assembling the commander program over
                            registry.listDrivers()
    index.ts                bin entry: shebang + buildProgram().parse()
  tests/                    behavior tests (in-process commander, per-command suites)

mcp/                        @tonesmith/mcp  (bin: tonesmith-mcp)
  src/
    common/                 pieces every tool registration shares (barrel: common/index.ts):
                            response.ts (ok / err), attempt.ts (runs a handler's work, turning a
                            throw into an error response), errors.ts (messageOf), schemas.ts (the
                            shared `device` input field)
    instructions.ts         server-onboarding text sent to every client at initialize, written as
                            the two-call path for building patches rather than a tool inventory
    tools/                  tool registrations, all device-agnostic (barrel: tools/index.ts):
                            list_devices, read_patch, write_fields, describe_device, copy_patch,
                            create_patch_file, generate_patch
    server.ts               buildServer(), registering the tools
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

- **Builder functions:** named after the block they configure, no "set" prefix; scaffolding helpers
  (gx1's `basePatch`) are the naming exception. Each takes the patch plus one options object, and
  any block whose params vary by type carries them in a `params` bag. That bag is validated against
  the current type's known fields, so an unknown key throws rather than silently writing a byte
  that means something else for this type. The builders are internal: a consumer builds a patch
  from a spec through `PatchDriver.buildPatch`.

- **`write` dot-notation:** `fx1.params.rate=50` walks the decoded patch object; each segment
  after splitting on `.` navigates one level deeper. The walk belongs to the driver
  (`PatchDriver.applyEdits`), since a path's segments are the device's own field names, and a
  device free to present them some other way needs somewhere to say so. A `type` edit re-seeds its
  block to that type's factory settings as the edit lands, so a control of the new type is a field
  the paths after it can find, and none of the previous effect's values are left for the codec to
  read back under the new type's field map.

Device-specific byte layouts, field names, and value tables do **not** live here. They would bloat
this file and go stale as devices are added. When you need that detail for a device, read its
`core/docs/<id>/FORMAT.md` (byte-level format spec) and `core/src/devices/<id>/types/` (current
decoded-patch field lists) directly; don't duplicate any of it into this file.

## Conventions

Decisions that tooling can't check and that are expensive to relitigate. The structural conventions
(how a device plugs in, the device-agnostic shared layer, the `driver.ts` / `index.ts` split, domain
grouping, naming, exports at the bottom) are in README.md's Contributing section and apply here; what
follows is what that section doesn't carry. The mechanical rules are
already errors in `eslint.config.js` (at most three parameters, no duplicate function bodies, no em
dashes, ternaries assigned before use, cognitive complexity 10), so they are not repeated here.

- **The driver supplies the view; the CLI only renders it.** `PatchDriver.viewPatch` returns the
  patch as a person reads it, and one printer in `cli/src/common/` walks it, so a device ships with
  no CLI code of its own. What this does not do is drive the display off `capabilities`, which reads
  as the obvious refactor and isn't one: a generic loop over the catalog trades deliberate grouping
  and ordering for an alphabetical field dump. Grouping, ordering and panel labels stay the
  driver's, which is what keeps that objection answered.
- **`type` and `subType` each mean one thing, everywhere.** `type` is the block's own selector, and
  `subType` is the model within it, in a patch spec, on a decoded block, and in the codec's field
  maps. Where a device stores the selection in a param byte, the codec's field map still names that
  byte `subType`, and decode lifts it onto the block so the decoded patch carries the selection once
  rather than in two places a consumer has to keep in agreement. Which selectors get to be a
  `subType` at all is decided by what
  `describe_device` can carry: a `subType` gets a name, a description and a real-world `models`
  string per value, so a selector qualifies when its values are named variants worth describing one
  by one, and stays an ordinary param when it sets one aspect of a single effect and the value names
  speak for themselves. The device's own label is evidence, not the rule (the GX-1 labels two
  sub-model selectors MODE and one param TYPE).
- **A setting the patch owns is described, not left to be discovered.** `DeviceCapabilities`
  carries `patchSettings` beside `patchName` for what a device stores per patch rather than per
  block: a reference tempo, an output trim, a musical key. Nothing in `groups` cross-checks these,
  so one left out is one a consumer meets only by reading a patch that already has it, which is how
  the GX-1's `key` sat decoded and undiscoverable. They are ordinary catalog params and take the
  same validation a block's params take, on both write paths.
- **`param-catalog.ts`, `capabilities.ts`, and `types/` are three views of one truth**, not
  triplication to collapse. The catalog is the param ground truth, capabilities is the structure an
  agent browses, the types are the decoded shape. The drift guards
  (`core/tests/devices/<id>/capabilities.test.ts` and the defaults guard) are what let the three
  coexist, so they stay even when other defensive tests go.
- **A device's block catalog never enters the tool schema.** `tools/list` sits in the model's
  context on every request, and one device's per-type schema measured 24,902 bytes against 5,205
  for every device-agnostic tool combined, so a per-device generate tool made the resident cost
  scale with the roster. Deleting that layer took `tools/list` from 30,115 bytes to 7,129. A static
  schema fits an argument shape that is fixed and independent of the argument values; a block's
  fields depend on its `type`, which is a lookup, not a signature. `generate_patch` takes a
  permissive `patches` array and the driver validates it, which is what `fx` already did for all
  39 of its effect types. Point-of-use detail lives in `describe_device`, paid once.
- **A tool's response is an envelope, and the patch sits inside it.** `read_patch` answers
  `{ setName, index, patch }`, its paged form `{ index, patch }` per entry, and `generate_patch`
  `{ name, action, patch }`, so an agent that reads a patch and generates one meets one shape.
  Spreading a patch across the envelope's own keys is what lets a block named `index` or `setName`
  shadow the tool's own report, the same hazard nesting closed at block level. Nothing beside the
  patch is hoisted out of it either: a field carried twice is a field that can disagree with itself.
- **Tests assert the data a message carries, never its wording.** Assert that a rejection names the
  bad id and lists the valid ones; don't assert the sentence it says them in. Prose written for
  agents gets reworded constantly, and a wording assertion turns every such edit into a test edit.
- **Coverage thresholds are floors, not targets.** They sit well below the measured numbers
  deliberately. Don't write tests to raise them, and don't ratchet them toward what the suite
  currently scores: chasing the last uncovered branch is what produced the wording assertions above.
- **cli and mcp test their own wiring, not core's behavior.** README states the rule; the criterion
  that makes it decidable is that a surface test earns its place only if it can fail while core is
  entirely correct. Reading a written file back through the driver to check a command's effect
  qualifies, since that fails on a miswiring. 86 of 178 surface tests failed the criterion.
- **Comments earn their line by explaining why.** The constraint that forced this shape, the bug it
  prevents, the reason the obvious approach fails. A comment restating the code teaches nothing and
  goes stale on the next edit. A comment also states a present property, never history: no "used to",
  no "before this fix", no "now does X" contrasting with a past, no PR number as the reason. The bug
  a guard prevents is fair game phrased as a present fact; git owns the rest. Match the comment
  density of the file you're already in.
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
| `read_patch`          | `device`, `file`, `ref?`, `limit?`, `offset?`                      | `ref` = index or name, answered as `{ setName, index, patch }`. Omit it to page through the file: 20 patches by default (`limit` up to 100), each as `{ index, patch }`, plus `total` and a `more` line naming the offset to continue from                  |
| `generate_patch`      | `device`, `outPath`, `setName?`, `patches[]`                       | One tool for every device: the per-patch spec comes from `describe_device`, not from this tool's schema. Builds every patch in `patches` and upserts them by name into `outPath` in array order, in one file write (replaces a same-named patch, appends otherwise, creates the file and any missing parent directories if needed). The response reports each patch as `{ name, action, patch }`, the patch complete with the defaults it filled in, so no follow-up read is needed |
| `write_fields`        | `device`, `file`, `ref`, `fields`                                  | Dot-path mutations as a `{path: value}` record, same as CLI `write`. The batch applies atomically: a rejected edit leaves the file untouched. Setting a block's `type` switches the effect: the block arrives at that type's factory settings on its factory sub-model, and its previous controls are gone, so name the ones you want after the type in the same call |
| `describe_device`     | `device`, `items?`, `includeParams?`                               | Returns capability metadata. `items` is a list, so one call covers a whole patch's lookups: each entry is `"chain"`, a group id (`"amp"`), or `"<group>/<type>"` (`"fx/CHORUS"`, split on the first slash so `"fx/OD/DS"` works). The `"chain"` entry also carries what belongs to the patch rather than to a block: the name limit, and the patch settings written beside `name`. Omit `items` for a chain summary plus every group with every type id in it, which is what makes the next call nameable without listing each group first. A bare-group entry is an index with no per-type params, so name the types instead, or pass `includeParams` for the full set. A named type also carries an `example`: that block's spec at factory defaults, which is what shows where its params are written. One bad entry fails the whole call |
| `copy_patch`          | `device`, `src`, `srcRef`, `dst`, `dstRef`                         | Copies one patch into a slot in another file, replacing what was there. Both files must already exist. To add a patch without displacing one, use `generate_patch`, which appends by name                                                        |
| `create_patch_file`   | `device`, `file`, `setName?`, `patchCount?`                        | Starts an empty file of blank patches at the device's factory defaults, `patchCount` from 1 to 500. Never overwrites an existing file. Not part of building a patch from parameters: `generate_patch` creates its own output file                          |

## CLI capabilities command

```bash
node cli/dist/index.js <device> capabilities                  # list all groups
node cli/dist/index.js <device> capabilities <group>          # every type in one group
node cli/dist/index.js <device> capabilities <group> <type>   # one type's params in detail
```

## Adding a new device

Use the **add-device skill** (`.claude/skills/add-device/SKILL.md`), the single source of truth for
the full onboarding workflow: documentation capture, binary-format reverse engineering and
`FORMAT.md` write-up, core driver scaffolding, round-trip proof, capabilities + drift guards,
CLI/MCP wiring, and changesets. Don't duplicate its steps here; if the workflow changes, update
the skill.
