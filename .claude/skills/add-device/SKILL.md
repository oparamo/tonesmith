---
name: add-device
description: Guided workflow for onboarding a new guitar multi-effects processor device to tonesmith: documentation capture, binary format reverse-engineering, codec implementation, and CLI/MCP wiring. Use when the user wants to add support for a device tonesmith doesn't yet know about.
---

# Add a new device

tonesmith is a device-agnostic toolkit: `core/` holds a `PatchDriver<T>` per device, `cli/`
and `mcp/` register presentation layers on top of whatever `core/` exposes. Nothing in this
skill assumes a specific patch-file format, encoding, or vendor. Every device's file format,
byte layout, and terminology are discovered fresh. Existing devices are useful only as a
**structural** reference (directory layout, file-splitting conventions); never copy a byte
layout, field name, or block name from one device onto another.

Work through these checkpoints in order. Each is a real commit boundary: get one solid before
starting the next, and leave `pnpm lint && pnpm build && pnpm coverage` green from the repo root
at every boundary (build **before** coverage, since sibling packages resolve `@tonesmith/core`
through its built `dist/`). Coverage thresholds are floors well below what the suite actually
scores, not targets to hit, so new code still needs real tests: the floors catch a collapse, they
don't tell you when you're done.

## 1. Gather patch exports and documentation

Two inputs feed everything downstream: real patch-file exports (reverse-engineered in step 2)
and the official documentation (the source for step 5's capabilities). Both start with the
user, so open with one combined request covering exports and documentation sources, then do
the capture work while you wait.

**Ask the user for links or file paths to the documentation.** Don't hunt for it yourself
first: vendors scatter manuals across product pages, support portals, and downloads sections,
and a web search can land on the wrong device, the wrong hardware revision, or a third-party
summary. Bad capability data poisons step 5 quietly. Treat user-supplied sources as the
authoritative set; use web search only to fill gaps the user couldn't cover, and confirm
anything found that way with the user (right device? right manual revision?) before relying
on it.

**Ask the user for patch-file exports. You cannot obtain these yourself.** Exports come from
the device's own editor software, which is typically proprietary, tied to owning the hardware,
or behind a vendor account. Make the request concrete:

- a factory-default (untouched) export, as a clean baseline
- a few exports of real, varied presets
- later, once the docs have taught you the parameter names: pairs of exports differing by
  exactly one parameter. Name the precise parameter and value for the user to set, since
  these targeted pairs are what make step 2's byte-diffing tractable

This is a pause point, not a dead end: continue with the documentation work below while the
user gathers files, and don't start step 2 until at least a baseline export has arrived. If
the exports arrive in a later conversation, resume this skill at step 2, since the checkpoints
stay valid across the gap. Keep received exports somewhere private (not committed) until
step 4, when two of them become committed fixtures.

**Documentation to collect:** at minimum the **parameter reference** (every effect/model name
and its value range; this later becomes the source of truth for the param catalog in step 5,
which capabilities derives from) and the **operation manual**. Vendors publish these as web
pages, downloadable PDFs, or both. Either works.

Convert sources to Markdown with the repo's `doc-to-md` tool, which converts exactly one URL or
file per run:

```bash
pnpm doc-to-md <manual-page-url> -o <out>.md    # HTML page
pnpm doc-to-md <local-path>.pdf -o <out>.md     # downloaded PDF manual
pnpm doc-to-md <pdf-url> -o <out>.md            # PDF straight from a URL
```

When a source maps 1:1 onto a subject, write straight to its committed path under
`core/docs/<id>/` (see the organization rules below); when several pages make up one subject,
convert them to scratch files first and merge them into the subject's single committed file.

The tool accepts an http(s) URL or a local file path and detects HTML versus PDF from the content
itself, so no format flag is normally needed (pass `--format html|pdf` only if detection ever
guesses wrong). Omitting `-o` prints the Markdown to stdout, which is useful for a quick look
before committing. After each conversion, skim the output: PDF extraction in particular can
garble multi-column layouts and tables, and a parameter table that lost its alignment is worse
than useless for step 5. Clean up anything mangled before relying on it.

**Traversing the vendor's site is your job, not the tool's.** It converts exactly one URL per
run and never follows links, and real manual sites are rarely one clean page per topic. Scout
the structure first: convert the landing/contents page without `-o` and skim the output to find
the section links worth converting. Expect any of these shapes: a manual split across many
linked pages, everything collected on one long page, or a navigation shell whose actual content
lives in iframes (feed the iframe's own URL to the tool, not the shell). A conversion that
comes back nearly empty, or as pure link soup, usually means you converted a wrapper page. Look
inside it for the real content URL instead of accepting the result.

**Organize the committed files by subject, not by source page.** Aim for one Markdown file per
section/domain of the manual, following the manual's own top-level sections (parameter
reference, effect descriptions, hardware operation, and so on). Source pagination is a
publishing artifact: if one section spans several web pages or a PDF, convert the pieces and
merge them into that section's single file; if one page covers several sections, split it. Don't
commit one file per fetched page, and don't concatenate the whole manual into a single giant
file. Subject-sized files let a later reader (usually an AI) search just the relevant file
instead of scanning a monolith. Where sections reference each other, add relative Markdown links
between the files.

All of a device's captured docs live under `core/docs/<id>/`. A manual that fits in one file is
a single `core/docs/<id>/<manual>.md`; when one manual yields several subject files, group them
in a subdirectory per manual (`core/docs/<id>/<manual>/<subject>.md`) so each document stays a
unit and the device's doc root stays skimmable.

## 2. Reverse-engineer and document the binary format

Requires the exports from step 1. Diff them byte-by-byte to map out the file's structure:
envelope framing, parameter block boundaries, and per-field encoding (fixed offsets,
nibble-packed values, lookup tables, signed ranges, and so on). For targeted probes, work the
loop with the user, since you don't operate the editor and they do: ask them to change one named
parameter to a specific value, re-export, and send the file; diff it against the previous export
to isolate which bytes moved. Batch these requests where you can (several parameters across
different blocks per round) so each round trip to the user resolves more of the format.

Write up the findings as `core/docs/<id>/FORMAT.md`. Follow this structure top to bottom: the
envelope shape, then a block inventory table (in the order the format actually stores blocks),
then one section per block in that same order, with a shared "encoding conventions" section
defined once before any section that relies on it, and an "out of scope" section at the end for
anything observed but not yet decoded. Define a thing before referencing it; don't make the
reader hold context from far earlier in the file. The finished spec should read top to bottom in
a single pass, with little to no jumping around the page to follow it.

Keep FORMAT.md to the **byte-layout narrative**: offsets, encoding families, per-field byte
homes. The **param surface** (param names, value ranges, descriptions) is owned by
`param-catalog.ts` (step 5), so don't duplicate ranges or descriptions here. Field names in the
byte maps are fine (they are the byte layout), and are what the drift guard reconciles against
the catalog.

Watch for a **union block layout**, where every type of a multi-type block keeps its own
permanent byte window rather than sharing one region. It is common, and it is worth calling out
in FORMAT.md when you find it, because step 4's factory-default fixture then carries a real
default for every type at once, not just the selected one.

In committed docs and commit messages, describe the vendor's editor software generically. Never
name its internal files, paths, or implementation details.

## 3. Scaffold the core driver

Create `core/src/devices/<id>/` with:
- `types/`: type definitions split by domain, plus a barrel `index.ts`
- `common/`: shared internals, plus a barrel `index.ts`. `constants.ts` holds ordered lookup
  arrays, with reverse-index maps derived via `Object.fromEntries(list.map((v, i) => [v, i]))`,
  and `raw.ts` holds a unique symbol for stashing a decoded patch's original raw bytes
- `codec/`: the encode/decode pipeline, split into primitives, field codecs, per-block
  codecs, and a top-level patch composer, plus a barrel `index.ts`
- a file-I/O module (`readFile` / `writeFile` / `blankPatch` / `newFile`), named after the
  device's own patch-file format rather than a borrowed name
- `builder.ts`: high-level construction helpers, named after the block they configure with no
  "set" prefix. Each takes the patch plus one options object; a block whose params vary by type
  carries them in a `params` bag, validated against the current type's fields so an unknown key
  throws instead of writing a byte that means something else for this type
- `defaults.ts`: each block type's factory defaults, authored in step 4 from the
  factory-default fixture. The builder fills any param the caller didn't set from here
- `param-domain.ts`: the value domains a param spec derives from (numeric interval, enum,
  lookup table, boolean, opaque text), so a param's human range string, machine value list, and
  numeric bounds are authored once and can't disagree
- `param-catalog.ts`: the param surface (per block/type, param name + range + description),
  the in-repo ground truth capabilities derives from and the drift guard checks the codec
  against; authored in step 5 (see there for what it's built from)
- `driver.ts`: exports a `PatchDriver<T>` object (the contract lives in
  `core/src/types/driver.ts`) wiring the codec and file-I/O functions together. A driver
  never self-registers
- `index.ts`: the device's public barrel, exporting the driver, patch types, and builder helpers

**Round-trip byte preservation is non-negotiable**: the codec must start from the original raw
bytes and overwrite only the byte indices it has actually decoded. Anything not yet understood
passes through untouched, so an incomplete format spec never corrupts a file.

Then wire it up with exactly two lines outside the device directory:
- one roster line in `core/src/devices/index.ts` (the registration loop in `core/src/index.ts`
  picks it up from there)
- one namespace re-export in `core/src/index.ts`: `export * as <id> from "./devices/<id>"`

## 4. Prove the codec round-trips, then harvest defaults

Commit two of the user's exports, each in the device's own native file extension.

The **round-trip baseline** goes at the repo root under `fixtures/<id>/`, not inside `core/`,
since core, cli, and mcp tests all share it. Prefer the richest export, one whose patches
genuinely differ from each other and from factory state, over the factory-default file: varied
bytes in ranges the codec doesn't decode yet are exactly what catches pass-through regressions,
and a clean baseline can't provide them.

The **factory-default export** goes under `core/tests/fixtures/<id>/`. It is what step 3's
`defaults.ts` is built from: decode it through the driver and read out each type's own field
window, which for a union-layout block (step 2) holds that type's real factory value whether or
not the type is selected. Write the harvested values into `defaults.ts` and add a drift guard
that re-harvests from the fixture and asserts equality, so a fixture or codec change can't leave
the table stale. Harvest rather than guess: an invented default silently ships a value the
device would never produce.

Harvest the **sub-model each type opens on** as well, wherever a type offers a choice of models.
That selection usually sits inside the type's own param window like any other field, so it is a
factory default in exactly the same sense, but a patch spec sets it as the block's variant rather
than as a control, so it belongs in its own table rather than among the param defaults. The reason
to pay for the harvest is that the alternatives are both wrong: leaving the variant out of an
example shows a shape that omits a field the block takes, and naming the first model in the list
puts a value the device never chose in something labeled a factory default.

Write byte-for-byte round-trip tests in `core/tests/devices/<id>/`, mirroring the source
layout: decode the fixture, re-encode it, and assert the output bytes match the input exactly.
Add targeted tests for individual field codecs and any lookup-table edge cases (an
unknown or out-of-range raw value should decode to a clearly labeled sentinel rather than
throwing). Tests are BDD-style (`describe` behavior, `it` does-X) and assert through public
surfaces, the driver and exported helpers, never internals.

## 5. Author the param catalog, then capabilities

Author the param surface **once**, in `core/src/devices/<id>/param-catalog.ts`, then build
capabilities on top of it. Don't hand-write param ranges twice.

1. **`param-catalog.ts`**: from the parameter reference captured in step 1, write the param
   surface as, per block/type, ordered params of `{ name, range, description }`, each built from
   a `param-domain.ts` domain rather than a hand-written range string. This is the in-repo
   ground truth for what params the device actually has. Verify each param's presence and range
   against the vendor's own ground-truth data where available (kept out of the repo and
   described generically, per step 2's discretion rule); its completeness is what makes the
   drift guard below meaningful.
2. **`capabilities.ts`**: a `DeviceCapabilities` object covering every group the device exposes
   (effect types, amp/cab models, subtypes, and so on). It holds only what's its own, meaning
   group/item structure, real-world models, sonic descriptions, and subtypes, and it **derives
   each item's `params` from the catalog** rather than restating them. Types whose param set
   varies by sub-model are modeled per-subtype, each subtype carrying its own catalog-derived
   params. **What earns a sub-model rather than a param** is what the capability response can
   carry: a subtype gets a name, a description and a real-world models string of its own, so a
   selector qualifies when its values are named variants worth describing one by one, and stays an
   ordinary param when it sets one aspect of a single effect and the value names speak for
   themselves. Read the device's own label as evidence rather than as the rule; a vendor is free to
   call two selectors the same thing and mean different things by them. Whatever the answer, the
   two words never trade places: `type` selects the block's own model and `subType` the model
   within it, in a spec, on a decoded block, and in the codec's field maps alike. Also author the required **`chain`** (`ChainSpec`): its `defaultOrder` is the device's
   block order (derive it from the driver's own default-chain constant so the two can't drift),
   and its `description` explains, for this device, how blocks are reordered and how they're
   turned on and off (which blocks can be bypassed, and any that can't). This is the signal-chain
   model an agent consults first. Take a chain as the **complete** block order, every block
   exactly once, and reject anything less: where a partial list's missing blocks belong is a
   guess, and a wrong guess silently ships a different sound. Say in the description that position
   and on/off are separate inputs, so leaving a block out of the order never reads as a way to
   switch it off. Also declare the required **`patchName`** (`{ maxLength }`): source it from the
   format's own name-field width, not a guess. It belongs to no capability group, so no other
   device data cross-checks it, and a guess that looks plausible against the sample files can sit
   there wrong for years. A consumer that learns the real limit by being rejected has already built
   the patch. Wire capabilities into the driver object from step 3.
3. **`example`**: on each item, or on the group itself where the block offers no types to choose
   between, a spec fragment `buildPatch` would accept, keyed by the block's own name in a spec and
   filled from the factory defaults harvested in step 4. Derive it; don't hand-write one per item.
   A param list says what a control is called and never where it goes, so a device free to nest one
   block's controls and carry another's flat leaves a consumer to find out by being rejected. Guard
   it by building every example: that one assertion covers the block key, the nesting, the defaults
   and the validator at once. Where the codec stores a variant selection in a field the spec selects
   differently, the example follows the spec, since it is a spec. A type with sub-models names the
   one it opens on, from the selector table harvested in step 4, so the variant reads as the sibling
   of the type that it is. Assert that every item declaring sub-models names one of its own.

Add the drift guard as a test. Because capabilities derives from the catalog, capabilities and
the codec can't drift by construction; the real risk is between the two independently authored
sources, the catalog (from the parameter reference) and the codec field maps (from byte
reverse-engineering). So the guard runs **codec against catalog**, table-driven and
bidirectional: for every type of every block, the codec's field names must match the catalog's
param names (minus type/subtype selectors), with per-block alias/exception maps for the
unavoidable naming mismatches. Adding a new type or field that isn't in both sources fails the
suite. Verifying the catalog against the vendor's ground-truth data stays a manual authoring
step, since that data isn't in the repo and so can't be a CI dependency.

## 6. Wire the presentation layers

- **CLI**: nothing to add. Every command, printing included, is device-agnostic and reads the
  core roster, so onboarding a device touches zero files under `cli/`. What `read` prints comes
  from one driver method, `viewPatch(patch)`: return the patch's blocks in the order a person
  should read them, each under the device's own panel label and its spec key, and whatever the
  device stores about the patch itself as `details`. Ordering and labels stay the driver's, which
  is why the CLI never walks `capabilities` to decide them (see CLAUDE.md's Conventions section).
- **MCP**: every tool, including patch generation, is device-agnostic and already wired, so
  onboarding a device touches zero files under `mcp/`. `list_devices`, `read_patch`,
  `write_fields`, `describe_device`, and `copy_patch` / `create_patch_file` pick the new device up
  automatically once its driver is in the core roster, the same as the CLI. `generate_patch` needs
  one thing from the driver to work for the new device: implement `buildPatch(spec)` (see
  `core/src/devices/gx1/spec/` for the current instance), which validates a plain spec object
  against the device's own capability catalog and builds the patch, owning its own rejection
  messages. Every bypassable block must accept a bare `{ on: false }`: wrap it with the
  `bypassable` helper so a bypass folds into the omitted case and writes identical bytes. Once
  `buildPatch` is in place, verify `generate_patch` works for the new device through the MCP
  server (per CLAUDE.md's Conventions, that means calling the tool, not checking the CLI). The
  response echoes each built patch plus its resolved chain, so a caller never needs a follow-up
  read to confirm a write. `write_fields` and the CLI's `write` ask for the driver's other
  method, `applyEdits(patch, edits)`: a dot-path's segments are the device's own field names, so
  resolving one, reading the value into the field it names, and reporting every problem at once
  are all the driver's to answer.
- **Tests**: behavior tests in `cli/tests/` and `mcp/tests/`, exercising every CLI command and
  MCP tool against the fixture from step 4, including error paths (bad ref, bad field path,
  unknown device).

## 7. Changesets and docs

Adding a device changes every published package that gained it: add one changeset
(`pnpm changeset`) with a **minor** bump for `@tonesmith/core` (new public device namespace)
and for `@tonesmith/cli` and `@tonesmith/mcp` (new device support in each surface). Also update
the device lists in `README.md` and `CLAUDE.md`'s Project section.

## Done when

- `pnpm lint && pnpm build && pnpm coverage` is green from the repo root.
- The committed fixture round-trips byte-for-byte through the driver's decode and encode.
- The defaults guard re-harvests the factory-default fixture and matches `defaults.ts`.
- The codec-to-catalog drift guard passes, and fails when you deliberately drop a param from a
  catalog type or a field from the codec (spot-check once, then revert).
- Against the built output, `node cli/dist/index.js <id> read fixtures/<id>/<fixture>` prints
  the patches and `node cli/dist/index.js <id> capabilities` lists the device's groups.
- CLI and MCP behavior tests cover the new device's happy paths and error paths, including
  `generate_patch` for the new device.
- Changesets exist (minor for `@tonesmith/core`, `@tonesmith/cli`, `@tonesmith/mcp`) and the
  device lists in `README.md` and `CLAUDE.md` mention the new device.

## Reference implementation

The GX-1 driver is the existing device to read for concrete examples of this layout, not to
copy from. Useful pointers:
- `core/docs/gx1/FORMAT.md`: a finished example of the step-2 write-up structure.
- `core/src/devices/gx1/`: a finished example of the step-3 and step-5 file layout.
- `fixtures/gx1/rock-tones.tsl`: a finished example of the step-4 round-trip fixture, and
  `core/tests/fixtures/gx1/default-init.tsl` of the factory-default one.
- `core/src/devices/gx1/view.ts`, `core/src/devices/gx1/spec/`: finished examples of step 6.

A new device's file extension, envelope shape, byte encodings, and terminology will differ from
GX-1's in ways that matter. Expect to discover them, not assume them.
