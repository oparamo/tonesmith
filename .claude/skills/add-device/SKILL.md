---
name: add-device
description: Guided workflow for onboarding a new guitar multi-effects processor device to tonesmith — documentation capture, binary format reverse-engineering, codec implementation, and CLI/MCP wiring. Use when the user wants to add support for a device tonesmith doesn't yet know about.
---

# Add a new device

tonesmith is a device-agnostic toolkit: `core/` holds a `PatchDriver<T>` per device, `cli/`
and `mcp/` register presentation layers on top of whatever `core/` exposes. Nothing in this
skill assumes a specific patch-file format, encoding, or vendor — every device's file format,
byte layout, and terminology are discovered fresh. Existing devices are useful only as a
**structural** reference (directory layout, file-splitting conventions); never copy a byte
layout, field name, or block name from one device onto another.

Work through these checkpoints in order. Each is a real commit boundary — get one solid before
starting the next, and leave `pnpm lint && pnpm build && pnpm coverage` green from the repo root
at every boundary (build **before** coverage — sibling packages resolve `@tonesmith/core` through
its built `dist/`). Coverage thresholds are ratcheted to the numbers the suite actually achieves,
so new code lands fully tested or CI fails.

## 1. Gather patch exports and documentation

Two inputs feed everything downstream: real patch-file exports (reverse-engineered in step 2)
and the official documentation (the source for step 5's capabilities). Both start with the
user, so open with one combined request covering exports and documentation sources, then do
the capture work while you wait.

**Ask the user for links or file paths to the documentation.** Don't hunt for it yourself
first: vendors scatter manuals across product pages, support portals, and downloads sections,
and a web search can land on the wrong device, the wrong hardware revision, or a third-party
summary — bad capability data poisons step 5 quietly. Treat user-supplied sources as the
authoritative set; use web search only to fill gaps the user couldn't cover, and confirm
anything found that way with the user (right device? right manual revision?) before relying
on it.

**Ask the user for patch-file exports — you cannot obtain these yourself.** Exports come from
the device's own editor software, which is typically proprietary, tied to owning the hardware,
or behind a vendor account. Make the request concrete:

- a factory-default (untouched) export, as a clean baseline
- a few exports of real, varied presets
- later, once the docs have taught you the parameter names: pairs of exports differing by
  exactly one parameter — name the precise parameter and value for the user to set, since
  these targeted pairs are what make step 2's byte-diffing tractable

This is a pause point, not a dead end: continue with the documentation work below while the
user gathers files, and don't start step 2 until at least a baseline export has arrived. If
the exports arrive in a later conversation, resume this skill at step 2 — the checkpoints
stay valid across the gap. Keep received exports somewhere private (not committed) until
step 4, when one becomes the public round-trip fixture.

**Documentation to collect** — at minimum the **parameter reference** (every effect/model name
and its value range; this later becomes the source of truth for the param catalog in
step 5, which capabilities derives from) and the **operation manual**. Vendors publish these as web pages, downloadable PDFs,
or both — either works.

Convert sources to Markdown with the repo's `doc-to-md` tool — it converts exactly one URL or
file per run:

```bash
pnpm doc-to-md <manual-page-url> -o <out>.md    # HTML page
pnpm doc-to-md <local-path>.pdf -o <out>.md     # downloaded PDF manual
pnpm doc-to-md <pdf-url> -o <out>.md            # PDF straight from a URL
```

When a source maps 1:1 onto a subject, write straight to its committed path under
`core/docs/<id>/` (see the organization rules below); when several pages make up one subject,
convert them to scratch files first and merge them into the subject's single committed file.

The tool accepts an http(s) URL or a local file path and detects HTML vs PDF from the content
itself, so no format flag is normally needed (pass `--format html|pdf` only if detection ever
guesses wrong). Omitting `-o` prints the Markdown to stdout — useful for a quick look before
committing. After each conversion, skim the output: PDF extraction in particular can garble
multi-column layouts and tables, and a parameter table that lost its alignment is worse than
useless for step 5 — clean up anything mangled before relying on it.

**Traversing the vendor's site is your job, not the tool's.** It converts exactly one URL per
run and never follows links, and real manual sites are rarely one clean page per topic. Scout
the structure first: convert the landing/contents page without `-o` and skim the output to find
the section links worth converting. Expect any of these shapes — a manual split across many
linked pages, everything collected on one long page, or a navigation shell whose actual content
lives in iframes (feed the iframe's own URL to the tool, not the shell). A conversion that
comes back nearly empty, or as pure link soup, usually means you converted a wrapper page —
look inside it for the real content URL instead of accepting the result.

**Organize the committed files by subject, not by source page.** Aim for one Markdown file per
section/domain of the manual — whatever the manual's own top-level sections are (parameter
reference, effect descriptions, hardware operation, ...). Source pagination is a publishing
artifact: if one section spans several web pages or a PDF, convert the pieces and merge them
into that section's single file; if one page covers several sections, split it. Don't commit
one file per fetched page, and don't concatenate the whole manual into a single giant file —
subject-sized files let a later reader (usually an AI) search just the relevant file instead of
scanning a monolith. Where sections reference each other, add relative Markdown links between
the files.

All of a device's captured docs live under `core/docs/<id>/`. A manual that fits in one file is
a single `core/docs/<id>/<manual>.md`; when one manual yields several subject files, group them
in a subdirectory per manual (`core/docs/<id>/<manual>/<subject>.md`) so each document stays a
unit and the device's doc root stays skimmable.

## 2. Reverse-engineer and document the binary format

Requires the exports from step 1. Diff them byte-by-byte to map out the file's structure:
envelope framing, parameter block boundaries, and per-field encoding (fixed offsets,
nibble-packed values, lookup tables, signed ranges, etc.). For targeted probes, work the loop
with the user — you don't operate the editor, they do: ask them to change one named parameter
to a specific value, re-export, and send the file; diff it against the previous export to
isolate which bytes moved. Batch these requests where you can (several parameters across
different blocks per round) so each round trip to the user resolves more of the format.

Write up the findings as `core/docs/<id>/FORMAT.md`. Follow this structure top-to-bottom:
envelope shape → a block inventory table (in the order the format actually stores blocks) → one
section per block, in that same order, with a shared "encoding conventions" section defined
once before any section that relies on it → an "out of scope" section at the end for anything
observed but not yet decoded. Define a thing before referencing it; don't make the reader hold
context from far earlier in the file. The finished spec should read top-to-bottom in a single
pass, with little to no jumping around the page to follow it.

Keep FORMAT.md to the **byte-layout narrative** — offsets, encoding families, per-field byte
homes. The **param surface** (param names, value ranges, descriptions) is owned by
`param-catalog.ts` (step 5); don't duplicate ranges/descriptions here. Field names in the byte
maps are fine (they're the byte layout), and are what the drift guard reconciles against the
catalog.

In committed docs and commit messages, describe the vendor's editor software generically —
never name its internal files, paths, or implementation details.

## 3. Scaffold the core driver

Create `core/src/devices/<id>/` with:
- `types/` — type definitions split by domain, plus a barrel `index.ts`
- `common/` — shared internals, plus a barrel `index.ts`: `constants.ts` (ordered lookup
  arrays, with reverse-index maps derived via `Object.fromEntries(list.map((v, i) => [v, i]))`)
  and `raw.ts` (a unique symbol for stashing a decoded patch's original raw bytes)
- `codec/` — the encode/decode pipeline, split into primitives, field codecs, per-block
  codecs, and a top-level patch composer, plus a barrel `index.ts`
- a file-I/O module (`readFile` / `writeFile` / `blankPatch` / `newFile`) — name it after the
  device's own patch-file format, not a borrowed name
- `builder.ts` — high-level, no-"set"-prefix construction helpers (an unknown field key should
  throw rather than write silently)
- `param-catalog.ts` — the param surface (per block/type → param name + range + description),
  the in-repo ground truth capabilities derives from and the drift guard checks the codec
  against; authored in step 5 (see there for what it's built from)
- `driver.ts` — exports a `PatchDriver<T>` object (the contract lives in
  `core/src/types/driver.ts`) wiring the codec and file-I/O functions together (a driver
  never self-registers)
- `index.ts` — the device's public barrel: the driver, patch types, and builder helpers

**Round-trip byte preservation is non-negotiable**: the codec must start from the original raw
bytes and overwrite only the byte indices it has actually decoded. Anything not yet understood
passes through untouched, so an incomplete format spec never corrupts a file.

Then wire it up with exactly two lines outside the device directory:
- one roster line in `core/src/devices/index.ts` (the registration loop in `core/src/index.ts`
  picks it up from there)
- one namespace re-export in `core/src/index.ts`: `export * as <id> from "./devices/<id>"`

## 4. Prove the codec round-trips

Commit one real device export, using its own native file extension, as the shared round-trip
baseline for core/cli/mcp tests. Put it at the repo root under `fixtures/<id>/`, not inside
`core/`. Prefer the richest of the user's exports — one whose patches genuinely differ from
each other and from factory state — over the factory-default file: varied bytes in ranges the
codec doesn't decode yet are exactly what catches pass-through regressions, and a clean
baseline can't provide them.

Write byte-for-byte round-trip tests in `core/tests/devices/<id>/`, mirroring the source
layout: decode the fixture, re-encode it, and assert the output bytes match the input exactly.
Add targeted tests for individual field codecs and any lookup-table edge cases
(unknown/out-of-range raw values should decode to a clearly-labeled sentinel rather than
throwing). Tests are BDD-style (`describe` behavior / `it` does-X) and assert through public
surfaces — the driver and exported helpers — never internals.

## 5. Author the param catalog, then capabilities

Author the param surface **once**, in `core/src/devices/<id>/param-catalog.ts`, then build
capabilities on top of it — don't hand-write param ranges twice.

1. **`param-catalog.ts`** — from the parameter reference captured in step 1, write the param
   surface: per block/type → ordered params `{ name, range, description }`. This is the in-repo
   ground truth for what params the device actually has. Verify each param's presence and range
   against the vendor's own ground-truth data where available (kept out of the repo and
   described generically, per step 2's discretion rule); its completeness is what makes the
   drift guard below meaningful.
2. **`capabilities.ts`** — a `DeviceCapabilities` object covering every group the device exposes
   (effect types, amp/cab models, subtypes, etc.). It holds only what's its own —
   group/item structure, real-world models, sonic descriptions, subtypes — and **derives each
   item's `params` from the catalog** rather than restating them. Types whose param set varies
   by sub-model are modeled per-subtype (each subtype carries its own catalog-derived params).
   Wire capabilities into the driver object from step 3.

Add the drift guard as a test. Because capabilities derives from the catalog, `capabilities ↔
codec` can't drift by construction; the real risk is between the two independently authored
sources — the catalog (from the parameter reference) and the codec field maps (from byte
reverse-engineering). So the guard is **`codec ↔ catalog`**, table-driven and bidirectional:
for every type of every block, the codec's field names must match the catalog's param names
(minus type/subtype selectors), with per-block alias/exception maps for the unavoidable
naming mismatches. Adding a new type or field that isn't in both sources fails the suite.
Verifying the catalog against the vendor's ground-truth data stays a manual authoring step
(that data isn't in the repo, so it can't be a CI dependency).

## 6. Wire the presentation layers

- **CLI**: `cli/src/devices/<id>/` with a `print.ts` (patch pretty-printer) and a barrel
  `index.ts` exporting a `CliDescriptor` whose `configure` hands the driver and printer to the
  shared `configureDeviceCommands` from `cli/src/common` — read / write / copy / new /
  capabilities all come from that shared wiring; write no per-device command code. Add one
  roster line in `cli/src/devices/index.ts`.
- **MCP**: the generic tools (`list_devices`, `read_patch`, `write_field`, `describe_device`)
  pick the new device up automatically once its driver is in the core roster. Only patch
  generation is per-device: `mcp/src/devices/<id>/` with a `generate_<id>_patch` tool plus the
  zod schemas it needs (derive the tool description's type catalog from the driver's
  capabilities so it can't drift), and one roster line in `mcp/src/devices/index.ts`.
- **Tests**: behavior tests in `cli/tests/` and `mcp/tests/` — exercise every CLI command and
  MCP tool against the fixture from step 4, including error paths (bad ref, bad field path,
  unknown device).

## 7. Changesets and docs

Adding a device changes every published package that gained it: add one changeset
(`pnpm changeset`) with a **minor** bump for `@tonesmith/core` (new public device namespace)
and for `@tonesmith/cli` / `@tonesmith/mcp` (new device support in each surface). Also update
the device lists in `README.md` and `CLAUDE.md`'s Project section.

## Done when

- `pnpm lint && pnpm build && pnpm coverage` is green from the repo root.
- The committed fixture round-trips byte-for-byte through the driver's decode → encode.
- The codec↔catalog drift guard passes — and fails when you deliberately drop a param from a
  catalog type or a field from the codec (spot-check once, then revert).
- Against the built output, `node cli/dist/index.js <id> read fixtures/<id>/<fixture>` prints
  the patches and `node cli/dist/index.js <id> capabilities` lists the device's groups.
- CLI and MCP behavior tests cover the new device's happy paths and error paths, including
  `generate_<id>_patch`.
- Changesets exist (minor for `@tonesmith/core`, `@tonesmith/cli`, `@tonesmith/mcp`) and the
  device lists in `README.md` and `CLAUDE.md` mention the new device.

## Reference implementation

The GX-1 driver is the existing device to read for concrete examples of this layout — not to
copy from. Useful pointers:
- `core/docs/gx1/FORMAT.md` — a finished example of the step-2 write-up structure.
- `core/src/devices/gx1/` — a finished example of the step-3/5 file layout.
- `fixtures/gx1/rock-tones.tsl` — a finished example of the step-4 fixture.
- `cli/src/devices/gx1/`, `mcp/src/devices/gx1/` — finished examples of step 6.

A new device's file extension, envelope shape, byte encodings, and terminology will differ from
GX-1's in ways that matter — expect to discover them, not assume them.
