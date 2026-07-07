# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**tonesmith** — TypeScript monorepo toolkit for reading, editing, and building guitar multi-effects
processor patch files. Currently implements the **BOSS GX-1** (`.tsl` format — JSON envelope
containing binary-encoded parameter blocks). Designed to support additional devices.

## Build & dev commands

```bash
pnpm install            # install all workspace deps
pnpm build              # compile all workspaces (tsc -b with project references)
pnpm test               # run Vitest (codec round-trip tests in core/)
pnpm test:watch         # watch mode
pnpm clean              # rm -rf core/dist cli/dist mcp/dist

# Run the CLI (after pnpm build):
node cli/dist/index.js gx1 read <file.tsl>

# Run the MCP server (after pnpm build):
pnpm --filter tonesmith-mcp start

# Generate preset packs:
pnpm --filter tonesmith gen:bad-bunny   # → core/examples/gx1/bad-bunny.tsl
pnpm --filter tonesmith gen:gilmour     # → core/examples/gx1/gilmour.tsl

# Convert a documentation page to Markdown (prints to stdout; add -o to write a file):
pnpm html-to-md <url> [-o out.md]
```

The reverse-engineered binary format is in `core/docs/gx1/FORMAT.md` — read it before modifying any
encode/decode logic. The authoritative reference for parameter names and value ranges is
`core/docs/gx1/gx1_parameter_guide.md`. The round-trip fixture is `fixtures/gx1/rock-tones.tsl`.

## Repository layout

```text
fixtures/gx1/
  rock-tones.tsl          real-world fixture (committed — round-trip baseline, shared by core/cli/mcp tests)

core/                       tonesmith
  src/
    types/                  device-agnostic type definitions (barrel: types/index.ts)
      patch.ts              Patch, PatchFile, RawPatch
      driver.ts             PatchDriver<T> interface (includes capabilities field)
      capabilities.ts       DeviceCapabilities, CapabilityGroup, CapabilityItem, ParamSpec
    registry.ts             registerDriver / getDriver / listDrivers
    patch-utils.ts          resolvePatchIndex / coerceValue / setByPath
    index.ts                public re-exports (all of the above + GX-1 symbols)
    devices/gx1/
      types/                GX-1 type definitions (barrel: types/index.ts)
        tsl.ts              RawParamSet, TslEnvelope, FxParams
        blocks.ts           FxBlock, OdDsBlock, AmpBlock, NsBlock, FvBlock, DelayBlock, ReverbBlock
        patch.ts            Gx1Patch, Gx1PatchFile
      constants.ts          ordered lookup arrays + reverse-index maps
      tsl.ts                readFile / writeFile / blankPatch / newFile
      gx1.ts                PatchDriver<Gx1Patch> implementation (registered on import)
      builder.ts            basePatch, amp, odds, fx, ns, delay, reverb, saveTsl
      raw.ts                RAW unique symbol (attaches raw bytes to decoded objects)
      capabilities.ts       full GX-1 DeviceCapabilities (fx, odds, amp, cab, mic, delay, reverb, ns, fv)
      capabilities.test.ts  drift guard — asserts every constant id has a CapabilityItem
      codec.test.ts         Vitest round-trip snapshot tests
      codec/                encode/decode pipeline (barrel: codec/index.ts)
        primitives.ts       bytesFromHex / hexFromBytes / lookupName / lookupIndex / toSigned / toUnsigned
        fields.ts           FieldCodec interface + u8 / signed / lookup / scaled / u16be / decodeFields / encodeFields
        blocks.ts           per-block encode/decode (amp, od/ds, ns, fv, chain, name, delay, reverb)
        fx-params.ts        decodeFxType / encodeFxType / decodeFxParams / encodeFxParams
        patch.ts            decodePatch / encodePatch (top-level composition)
  examples/gx1/
    bad-bunny.ts / gilmour.ts  preset generators using builder.ts
    bad-bunny.md / gilmour.md  tone-library reference docs
    *.tsl                      gitignored (regenerate via pnpm gen:*)
  docs/gx1/
    FORMAT.md               reverse-engineered TSL binary format
    gx1_parameter_guide.md  effect parameters and value ranges
    gx1_reference_manual.md hardware operation reference

cli/                        tonesmith-cli  (bin: tonesmith)
  src/
    capabilities-print.ts   device-agnostic colour printer for DeviceCapabilities
    index.ts                entry point — device dispatcher → gx1
    devices/gx1/            GX-1 CLI commands (barrel: devices/gx1/index.ts)
      command.ts            read / write / copy / new / capabilities commands
      print.ts              printPatch — GX-1 patch pretty-printer

mcp/                        tonesmith-mcp  (bin: tonesmith-mcp)
  src/
    response.ts             ok / err MCP response helpers
    schemas.ts              shared zod schemas (FxBlockSchema)
    index.ts                McpServer over stdio — registers all tools
    tools/                  MCP tool registrations (barrel: tools/index.ts)
      list-devices.ts       list_devices tool
      read-patch.ts         read_patch tool
      generate-patch.ts     generate_patch tool
      write-field.ts        write_field tool
      describe-device.ts    describe_device tool

tools/html-to-md/
  index.ts                  CLI — fetch a URL, convert to Markdown, print or write it
  fetch.ts                  fetchPage(url) — plain HTTP GET with a browser-like User-Agent
```

## Architecture

```text
.tsl file (JSON)
  → readFile()       reads JSON envelope, calls decodePatch() on each patch
  → decodePatch()    hex string → Gx1Patch (all blocks decoded)
  → encodePatch()    Gx1Patch → raw bytes (start from original, overwrite known indices)
  → writeFile()      writes JSON envelope back to disk
```

**Key design rules** (apply to every device driver, not just GX-1):

- **Round-trip byte preservation:** each device's `codec/patch.ts` starts from the original raw
  hex bytes (stashed under the `RAW` symbol) and overwrites only the byte indices it knows.
  Unknown/unused bytes pass through untouched — this prevents file corruption from format fields
  not yet reverse-engineered.

- **Lookup tables:** defined as ordered `const` arrays in `constants.ts`; reverse-index maps
  (`AMP_TYPE_IDX`, etc.) are derived with `Object.fromEntries(list.map((v,i) => [v,i]))`.

- **Builder functions:** no "set" prefix (`amp`, `odds`, `fx`, `ns`, `fv`, `delay`, `reverb`, ...);
  `clearOdds`/`basePatch`/`saveTsl` are naming exceptions. Setter-style `extra` params are
  validated against the current type's known fields — an unknown key throws rather than being
  silently written.

- **`write` dot-notation:** `fx1.params.rate=50` walks the decoded patch object; each segment
  after splitting on `.` navigates one level deeper.

Device-specific byte layouts, field names, and value tables do **not** live here — they'd bloat
this file and go stale as devices are added. For GX-1, read `core/docs/gx1/FORMAT.md` (byte-level
format spec) and `core/src/devices/gx1/types/patch.ts` (current `Gx1Patch` field list) directly
when you need that detail; don't duplicate it into this file.

## MCP server tools

| Tool              | Inputs                                                                    | Notes                                                                                       |
|-------------------|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------------|
| `list_devices`    | —                                                                         | Returns `[{ id, name }]`                                                                    |
| `read_patch`      | `file`, `ref?`                                                            | `ref` = index or name; omit for all patches                                                 |
| `generate_patch`  | `name`, `outPath`, `amp`, `fx1/2/3?`, `odds?`, `ns?`, `delay?`, `reverb?` | Calls builder, saves `.tsl`                                                                 |
| `write_field`     | `file`, `ref`, `field`, `value`                                           | Dot-path mutation, same as CLI `write`                                                      |
| `describe_device` | `device`, `group?`, `item?`                                               | Returns capability metadata; omit `group` for all groups, add `item` to drill into one type |

## CLI capabilities command

```bash
node cli/dist/index.js gx1 capabilities            # list all groups
node cli/dist/index.js gx1 capabilities amp        # all amp models
node cli/dist/index.js gx1 capabilities amp jc-120 # one amp model detail
```

## Adding a new device

1. Create `core/src/devices/<id>/` following the `gx1` domain-grouped layout:
   - `types/` — type definitions split by domain (`tsl.ts`, `blocks.ts`, `patch.ts`) + barrel `index.ts`
   - `constants.ts` — ordered lookup arrays + reverse-index maps
   - `codec/` — encode/decode pipeline following gx1's `primitives/fields/blocks/fx-params/patch` split + barrel `index.ts`
   - `tsl.ts` — file I/O (readFile / writeFile / blankPatch / newFile)
   - `builder.ts` — high-level patch-construction helpers
   - `raw.ts` — unique symbol for attaching raw bytes to decoded objects
   - `<id>.ts` — `PatchDriver<YourPatch>` implementation, calls `registerDriver` at import time
2. Author `core/src/devices/<id>/capabilities.ts` — a `DeviceCapabilities` object covering every
   group (effects, amp, cab, mic, etc.); add a `capabilities.test.ts` drift guard mirroring the
   GX-1 one. Wire `capabilities` into the driver object in `<id>.ts`.
3. Re-export the driver from `core/src/index.ts` (import for its side effect).
4. Create `cli/src/devices/<id>/` with `command.ts` (CLI commands) + `print.ts` (patch printer) + barrel `index.ts`.
   Register the barrel in `cli/src/index.ts`.
5. Convert any online reference manuals to Markdown with `pnpm html-to-md <url> -o core/docs/<id>/<name>.md`
   (one page per run), and add `examples/<id>/` for preset generators.
6. Write `core/docs/<id>/FORMAT.md`, the reverse-engineered binary format spec — model it on
   `core/docs/gx1/FORMAT.md`'s structure: envelope shape → a block inventory table (in the same
   order the format actually stores them) → one section per block, each in that same order,
   with a shared "encoding conventions" section defined once before the sections that use it →
   an "out of scope" section at the end for undecoded blocks. Keep it readable top-to-bottom:
   define a thing before you reference it, avoid "see above" pointers across more than a
   section or two, and don't make the reader hold context from far earlier in the file.
