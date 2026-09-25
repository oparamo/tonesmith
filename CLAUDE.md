# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**tonesmith** is a TypeScript monorepo toolkit for reading, editing, and building guitar
multi-effects processor patch files. Every device is a self-contained driver behind the same
device-agnostic core, CLI, and MCP surfaces; the docs below describe the shared layer and the
per-device pattern, never one device's internals. Supported devices: **BOSS GX-1** (`gx1`, `.tsl`).
New devices are onboarded with the adding-a-device skill (`.claude/skills/adding-a-device/SKILL.md`).

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
and treat it as the answer.** It's written from the device's own official parameter tables, not
inferred from sample files, so its offsets, field widths, and value tables are the device's own
numbers. Anything you'd otherwise dig through vendor material for should already be there; if it
isn't, or it disagrees with the code, that's a gap in FORMAT.md worth fixing, not a reason to
re-derive it elsewhere.

The captured manual docs alongside it, also under `core/docs/<id>/`, cover what the parameters
*mean*: what a control does, what it sounds like, how the device is operated. Use them for prose and
intent, and FORMAT.md for numbers.

Each device's committed round-trip fixture lives at `fixtures/<id>/`.

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) is the map: the layers and which way they import, the patterns
they follow, the repository layout file by file, and a diagram for how the packages fit and for each
package inside. Read it before moving or adding a file; a change that moves a box updates its
diagram. Every `device/<id>/` follows one fixed shape (gx1 is the reference; the adding-a-device
skill enforces it), and adding a device means that folder plus one roster line.

**Key design rules** (apply to every device driver):

- **Round-trip byte preservation:** each device's `format/codec/patch.ts` starts from the original raw
  hex bytes (stashed under the `RAW` symbol) and overwrites only the byte indices it knows.
  Unknown and unused bytes pass through untouched, which prevents file corruption from format
  fields not yet reverse-engineered.

- **Lookup tables:** defined as ordered `const` arrays in the device's `model/constants.ts`;
  reverse-index maps (`AMP_TYPE_IDX`, etc.) are derived with
  `Object.fromEntries(list.map((v,i) => [v,i]))`.

- **Builder functions:** named after what they configure, no "set" prefix: gx1's `basePatch` and
  `block(patch, name, options)`, which takes one path for blocks with a single shape of controls and
  another for blocks whose controls are the chosen type's. Every block carries its controls in a
  `params` bag. Builders are internal and take input `spec/` has already validated against the
  catalog, so they check nothing again: they fill what the caller left out with factory defaults. A
  consumer builds a patch from a spec through `PatchDriver.buildPatch`.
- **Every block's layout is a field list.** A block's controls are `FieldCodec`s, whether the block
  has one fixed set or one set per type, and the codec's `fieldsFor` is the one place that says which
  list a block, type and sub-model use. Capabilities stamps each param's `key` from it, and the drift
  guards compare it against the catalog.

- **`write` dot-notation:** `fx1.params.rate=50` walks the decoded patch object; each segment
  after splitting on `.` navigates one level deeper. `PatchDriver.applyEdits` stays the driver's
  method, so a device free to present its paths differently has somewhere to say so, but the walk,
  the value checks and the re-seed are core's `specService`, which a driver calls with its own
  capabilities and `buildPatch`. A `type` edit re-seeds its block to that type's factory settings as
  it lands, so the paths after it find fields of the new type; none of the previous effect's values
  survive for the codec to read back under the new field map.
- **The catalog carries what core checks against.** `specService` reads nothing but a driver's
  `DeviceCapabilities`: which group describes each chain block, whether it can be bypassed, and which
  blocks a type is limited to all live there as data. A check that needs a device fact the catalog
  can't express (the characters a name may use, the order a chain may take) stays in the driver's
  `spec/`.

Device-specific byte layouts, field names, and value tables do **not** live here. They would bloat
this file and go stale as devices are added. When you need that detail for a device, read its
`core/docs/<id>/FORMAT.md` (byte-level format spec) and `core/src/device/<id>/model/` (current
decoded-patch field lists) directly; don't duplicate any of it into this file.

## Conventions

Decisions that tooling can't check and are expensive to relitigate. The structural conventions (how
a device plugs in, the device-agnostic shared layer, the `driver.ts` / `index.ts` split, layer
folders, naming, exports at the bottom) live in README.md's Contributing section and apply here;
what follows is what that section doesn't cover. Mechanical rules are already enforced as
`eslint.config.js` errors (at most three parameters, no duplicate function bodies, no em dashes,
ternaries assigned before use, cognitive complexity 6, no sync fs calls, no fs imports in a
driver, layers importing only downward, no import cycles, camelCase file names), so they aren't
repeated here.

- **The driver supplies the view; the CLI only renders it.** `PatchDriver.viewPatch` returns the
  patch as a person reads it; one printer in `cli/src/common/` walks it, so a device ships no CLI
  code of its own. Don't drive the display off `capabilities` instead: a generic loop over the
  catalog trades deliberate grouping and ordering for an alphabetical field dump. Grouping,
  ordering, and panel labels stay the driver's.
- **A surface parses its own arguments, words its own output and sizes its own responses;
  everything else is a core call.** The test for anything else a surface is about to write: would
  the other surface, or a library consumer, need it too? If so it belongs in core, even when one
  surface is its only caller today. Lint can't see duplication across packages, so this is the
  check.
- **A change to a file is one core operation.** Anything that reads a file, changes it and writes
  it back belongs in `service/patchService.ts`, built on one of `patchFileRepository`'s locked
  operations (`updatePatchFile`, or `upsertPatchFile` where a missing file is a start rather than an
  error), so the lock spans the whole sequence. Nothing outside `persistence/` reads or writes a
  patch file. A surface composing
  its own read and write would reopen the lost-edit race the lock closes, and would duplicate logic
  the other surface needs too. The lock is not re-entrant: no locked operation calls another.
- **`type` and `subType` each mean one thing, everywhere.** `type` is the block's own selector,
  `subType` the model within it, in a patch spec, a decoded block, and the codec's field maps alike.
  Even where a device stores the selection in a param byte, the codec's field map still names it
  `subType`, and decode lifts it onto the block, so the decoded patch carries the selection once
  instead of two places that could disagree. What earns a `subType` is what `describe_device` can
  carry for it: a name, a description, and a real-world `models` string per value. A selector with
  named variants worth describing one by one qualifies; one that just sets one aspect of a single
  effect, with self-explanatory values, stays an ordinary param. The device's own label is evidence,
  not the rule: the GX-1 labels two sub-model selectors MODE and one param TYPE.
- **A setting the patch owns is described, not left to be discovered.** `DeviceCapabilities`
  carries `patchSettings` beside `patchName` for what a device stores per patch rather than per
  block: a reference tempo, an output trim, a musical key. `groups` doesn't cross-check these, so an
  omitted one surfaces only when a consumer stumbles on it in an existing patch. They're ordinary
  catalog params, validated like a block's params on both write paths.
- **`paramCatalog.ts`, `capabilities.ts`, and `model/`'s decoded types are three views of one truth**, not
  triplication to collapse: the catalog is the param ground truth, capabilities the structure an
  agent browses, the types the decoded shape. The drift guards
  (`core/tests/device/<id>/catalog/capabilities.test.ts` and the defaults guard) keep the three in sync, so
  they stay even when other defensive tests go.
- **A device's block catalog never enters the tool schema.** `tools/list` loads on every request,
  so a per-device generate tool would scale that resident cost with the roster instead of holding it
  fixed. A static schema only fits an argument shape that's fixed and independent of the values, and
  a block's fields depend on its `type`. `generate_patch` takes a permissive `patches` array and
  lets the driver validate it, the same approach `fx` already uses across all 39 of its effect
  types. Point-of-use detail lives in `describe_device`, paid once.
- **A tool's response is an envelope, and the patch sits inside it.** `read_patch` answers
  `{ setName, index, patch }` (paged: `{ index, patch }` per entry) and `generate_patch` answers
  `{ name, action, patch }`, so reading and generating share one shape. Spreading the patch across
  the envelope's own keys would let a block named `index` or `setName` shadow the tool's report, the
  same hazard nesting already closes at block level. Nothing else gets hoisted out of the patch
  either: a field carried twice can disagree with itself.
- **Tests follow README's [Testing](README.md#testing) section.**
- **A comment earns its line by telling the reader what the code can't:** the constraint that
  forced this shape, the bug it prevents, the reason the obvious approach fails, a unit, an encoding,
  the source of a magic value. A comment restating the code teaches nothing and
  goes stale on the next edit. State a present property, never history: no "used to," "before this
  fix," or "now does X," and no PR number as the reason. The bug a guard prevents is fair game
  phrased as a present fact; git owns the rest. Match the comment density of the file you're
  already in.
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
copy drifts from the original. `adding-a-device` is committed, since its workflow is specific to this
repository.

## MCP server tools

| Tool                  | Inputs                                                             | Notes                                                                                                                                                                                                                                                     |
|-----------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `list_devices`        | none                                                               | Returns `[{ id, name }]`                                                                                                                                                                                                                                  |
| `read_patch`          | `device`, `file`, `ref?`, `limit?`, `offset?`                      | `ref` (index or name) answers `{ setName, index, patch }`. Omit it to page: 20 patches by default (`limit` up to 100) as `{ index, patch }`, plus `total` and a `more` offset to continue from |
| `generate_patch`      | `device`, `outPath`, `setName?`, `patches[]`                       | One tool for every device; the per-patch spec comes from `describe_device`, not this tool's schema. Builds every patch in `patches` and upserts them by name into `outPath` in array order, in one write (replaces a same-named patch, appends otherwise, creating the file and any missing parent directories). Reports each patch as `{ name, action, patch }`, complete with the defaults it filled in, so no follow-up read is needed |
| `write_fields`        | `device`, `file`, `ref?`, `fields?`, `setName?`                    | Dot-path mutations as a `{path: value}` record, the same paths CLI `write` takes. The batch applies atomically: a rejected edit leaves the file untouched. Setting a block's `type` switches the effect to that type's factory settings on its factory sub-model, dropping its old controls, so name the new ones you want in the same call. `setName` renames the patch set (no CLI equivalent) and needs no `ref`. Asking for neither edit is an error, not a silent no-op |
| `describe_device`     | `device`, `items?`, `includeParams?`                               | Returns capability metadata. `items` is a list, so one call covers a whole patch's lookups: each entry is `"chain"`, a group id (`"amp"`), or `"<group>/<type>"` (`"fx/CHORUS"`, split on the first slash so `"fx/OD/DS"` works). `"chain"` also carries what belongs to the patch rather than a block: the name limit and the patch settings written beside `name`. Omit `items` for a chain summary plus every group and type id, so the next call needs no group listing first. A bare-group entry is an index with no per-type params; name the types, or pass `includeParams` for the full set. A named type also carries an `example`: its spec at factory defaults, showing where its params are written. One bad entry fails the whole call |
| `copy_patch`          | `device`, `src`, `srcRef`, `dst`, `dstRef`                         | Copies one patch into a slot in another file, replacing what was there. Both files must already exist. To add a patch without displacing one, use `generate_patch`, which appends by name                                                        |
| `create_patch_file`   | `device`, `file`, `setName?`, `patchCount?`                        | Starts an empty file of blank patches at the device's factory defaults, `patchCount` from 1 to 500. Never overwrites an existing file. Not part of building a patch from parameters: `generate_patch` creates its own output file                          |

Every tool carries a `title` for client display, and annotations: the three reads are read-only, and
the four writes are idempotent, so a repeated call with the same arguments changes nothing more. One
prompt, `build_patch` (`device`, `description`, `outPath`), states a person's request and leaves the
how to the server instructions.

## CLI capabilities command

```bash
node cli/dist/index.js <device> capabilities                  # list all groups
node cli/dist/index.js <device> capabilities <group>          # every type in one group
node cli/dist/index.js <device> capabilities <group> <type>   # one type's params in detail
```

## Adding a new device

Use the **adding-a-device skill** (`.claude/skills/adding-a-device/SKILL.md`), the single source of truth for
the full onboarding workflow: documentation capture, binary-format reverse engineering and
`FORMAT.md` write-up, core driver scaffolding, round-trip proof, capabilities + drift guards,
CLI/MCP wiring, and changesets. Don't duplicate its steps here; if the workflow changes, update
the skill.
