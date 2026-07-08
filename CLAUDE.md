# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**tonesmith** — TypeScript monorepo toolkit for reading, editing, and building guitar multi-effects
processor patch files. Currently implements the **BOSS GX-1** (`.tsl` format — JSON envelope
containing binary-encoded parameter blocks). Designed to support additional devices.

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

# Run the CLI (after pnpm build):
node cli/dist/index.js gx1 read <file.tsl>

# Run the MCP server (after pnpm build):
pnpm --filter @tonesmith/mcp start

# Generate preset packs:
pnpm --filter @tonesmith/core gen:bad-bunny   # → core/examples/gx1/bad-bunny.tsl
pnpm --filter @tonesmith/core gen:gilmour     # → core/examples/gx1/gilmour.tsl

# Convert a documentation source (HTML page or PDF, URL or local file) to Markdown
# (prints to stdout; add -o to write a file; format auto-detected, --format overrides):
pnpm doc-to-md <url|file> [-o out.md] [--format html|pdf]
```

The reverse-engineered binary format is in `core/docs/gx1/FORMAT.md` — read it before modifying any
encode/decode logic. The authoritative reference for parameter names and value ranges is
`core/docs/gx1/gx1_parameter_guide.md`. The round-trip fixture is `fixtures/gx1/rock-tones.tsl`.

## Repository layout

```text
fixtures/gx1/
  rock-tones.tsl          real-world fixture (committed — round-trip baseline, shared by core/cli/mcp tests)

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
    index.ts                registers the roster; public re-exports + device namespaces (gx1)
    devices/gx1/
      types/                GX-1 type definitions (barrel: types/index.ts)
        tsl.ts              RawParamSet, TslEnvelope, FxParams
        blocks.ts           FxBlock, OdDsBlock, AmpBlock, NsBlock, FvBlock, DelayBlock, ReverbBlock, PfxBlock
        patch.ts            Patch, PatchFile (used namespaced: gx1.Patch)
      common/               constants.ts (ordered lookup arrays + reverse-index maps) + raw.ts (RAW unique
                            symbol — attaches raw bytes to decoded objects), barrel index.ts
      codec/                encode/decode pipeline (barrel: codec/index.ts)
        primitives.ts       bytesFromHex / hexFromBytes / lookupName / lookupIndex / toSigned / toUnsigned
        fields.ts           FieldCodec interface + u8 / signed / lookup / scaled / decodeFields / encodeFields
        blocks.ts           per-block encode/decode (amp, od/ds, ns, fv, pfx, chain, name, delay, reverb)
        fx-params.ts        decodeFxType / encodeFxType / decodeFxParams / encodeFxParams
        patch.ts            decodePatch / encodePatch (top-level composition)
      tsl.ts                file I/O — readFile / writeFile / blankPatch / newFile
      builder.ts            basePatch, amp, odds, fx, ns, fv, pfx, delay, reverb, saveTsl
      capabilities.ts       full GX-1 DeviceCapabilities (fx, pfx, odds, amp, cab, mic, delay, reverb, ns, fv)
      driver.ts             PatchDriver<Patch> object wiring codec + file I/O together
      index.ts              device barrel — driver, patch types, builder helpers
  tests/                    mirrors src/ (patch-utils, registry, capability-utils, devices/gx1/* incl.
                            codec round-trip suites and both capabilities drift guards)
    fixtures/gx1/           default-init.tsl — factory-default export, clean-baseline complement to
                            the shared root fixture
  examples/gx1/
    bad-bunny.ts / gilmour.ts  preset generators using builder.ts
    bad-bunny.md / gilmour.md  tone-library reference docs
    *.tsl                      gitignored (regenerate via pnpm --filter @tonesmith/core gen:*)
  docs/gx1/
    FORMAT.md               reverse-engineered TSL binary format
    gx1_parameter_guide.md  effect parameters and value ranges
    gx1_reference_manual.md hardware operation reference

cli/                        @tonesmith/cli  (bin: tonesmith)
  src/
    common/                 device-agnostic pieces (barrel: common/index.ts)
      commands.ts           configureDeviceCommands — shared read / write / copy / new / capabilities
      capabilities-print.ts color printer for DeviceCapabilities
    devices/
      index.ts              CLI device roster — one CliDescriptor per device
      gx1/                  print.ts (GX-1 patch pretty-printer) + barrel index.ts (descriptor
                            handing driver + printer to the shared commands)
    types/                  CliDescriptor (barrel: types/index.ts)
    program.ts              buildProgram() — assembles the commander program from the roster
    index.ts                bin entry — shebang + buildProgram().parse()
  tests/                    behavior tests (in-process commander, per-command suites)

mcp/                        @tonesmith/mcp  (bin: tonesmith-mcp)
  src/
    common/                 response.ts — ok / err MCP response helpers (barrel: common/index.ts)
    tools/                  generic tool registrations (barrel: tools/index.ts)
      list-devices.ts       list_devices tool
      read-patch.ts         read_patch tool
      write-field.ts        write_field tool
      describe-device.ts    describe_device tool
    devices/
      index.ts              per-device tool roster
      gx1/                  generate_gx1_patch tool + its zod schemas (FxBlockSchema)
    server.ts               buildServer() — registers generic tools, then the device roster
    index.ts                bin entry — shebang + buildServer() over stdio
  tests/                    behavior tests (MCP InMemoryTransport, per-tool suites)

tools/                      repo tooling — not published, not exposed through MCP; shared
                            tsconfig.json + vitest.config.ts cover every script under tools/
  doc-to-md/
    index.ts                CLI — take a URL or file, convert HTML/PDF to Markdown, print or write it
    convert.ts              detectFormat (PDF magic bytes) + toMarkdown (node-html-markdown / pdf2md)
    fetch.ts                fetchDocument(url) — plain HTTP GET for bytes with a browser-like User-Agent
```

## Architecture

```text
.tsl file (JSON)
  → readFile()       reads JSON envelope, calls decodePatch() on each patch
  → decodePatch()    hex string → gx1.Patch (all blocks decoded)
  → encodePatch()    gx1.Patch → raw bytes (start from original, overwrite known indices)
  → writeFile()      writes JSON envelope back to disk
```

**Key design rules** (apply to every device driver, not just GX-1):

- **Round-trip byte preservation:** each device's `codec/patch.ts` starts from the original raw
  hex bytes (stashed under the `RAW` symbol) and overwrites only the byte indices it knows.
  Unknown/unused bytes pass through untouched — this prevents file corruption from format fields
  not yet reverse-engineered.

- **Lookup tables:** defined as ordered `const` arrays in the device's `common/constants.ts`; reverse-index maps
  (`AMP_TYPE_IDX`, etc.) are derived with `Object.fromEntries(list.map((v,i) => [v,i]))`.

- **Builder functions:** no "set" prefix (`amp`, `odds`, `fx`, `ns`, `fv`, `delay`, `reverb`, ...);
  `clearOdds`/`basePatch`/`saveTsl` are naming exceptions. Setter-style `extra` params are
  validated against the current type's known fields — an unknown key throws rather than being
  silently written.

- **`write` dot-notation:** `fx1.params.rate=50` walks the decoded patch object; each segment
  after splitting on `.` navigates one level deeper.

Device-specific byte layouts, field names, and value tables do **not** live here — they'd bloat
this file and go stale as devices are added. For GX-1, read `core/docs/gx1/FORMAT.md` (byte-level
format spec) and `core/src/devices/gx1/types/patch.ts` (current `gx1.Patch` field list) directly
when you need that detail; don't duplicate it into this file.

## MCP server tools

| Tool              | Inputs                                                                    | Notes                                                                                       |
|-------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| `list_devices`    | —                                                                         | Returns `[{ id, name }]`                                                                    |
| `read_patch`      | `file`, `ref?`                                                            | `ref` = index or name; omit for all patches                                                 |
| `generate_gx1_patch` | `name`, `outPath`, `amp`, `chain?`, `key?`, `odds?`, `pfx?`, `fx1/2/3?`, `ns?`, `fv?`, `delay?`, `reverb?` | Per-device tool: calls the GX-1 builder, saves `.tsl`                             |
| `write_field`     | `file`, `ref`, `field`, `value`                                           | Dot-path mutation, same as CLI `write`                                                      |
| `describe_device` | `device`, `group?`, `item?`                                               | Returns capability metadata; omit `group` for all groups, add `item` to drill into one type |

## CLI capabilities command

```bash
node cli/dist/index.js gx1 capabilities            # list all groups
node cli/dist/index.js gx1 capabilities amp        # all amp models
node cli/dist/index.js gx1 capabilities amp jc-120 # one amp model detail
```

## Adding a new device

Use the **add-device skill** (`.claude/skills/add-device/SKILL.md`) — the single source of truth
for the full onboarding workflow: documentation capture, binary-format reverse engineering and
`FORMAT.md` write-up, core driver scaffolding, round-trip proof, capabilities + drift guards,
CLI/MCP wiring, and changesets. Don't duplicate its steps here; if the workflow changes, update
the skill.
