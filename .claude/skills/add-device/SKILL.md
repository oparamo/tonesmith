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
starting the next.

## 1. Gather documentation

Collect the device's official manual and parameter reference online. Convert each relevant page
to Markdown and save it under `core/docs/<id>/`:

```bash
pnpm html-to-md <url> -o core/docs/<id>/<page>.md
```

Also obtain a handful of real patch-file exports from the device's own editor software —
ideally pairs that differ by exactly one parameter, which makes byte-diffing tractable in the
next step. Save them somewhere private (not committed) until step 4, when one becomes the
public round-trip fixture.

## 2. Reverse-engineer and document the binary format

Diff the exports byte-by-byte to map out the file's structure: envelope framing, parameter
block boundaries, and per-field encoding (fixed offsets, nibble-packed values, lookup tables,
signed ranges, etc.). Change one parameter at a time in the editor, re-export, and diff against
the previous export to isolate which bytes moved.

Write up the findings as `core/docs/<id>/FORMAT.md`. Follow this structure top-to-bottom:
envelope shape → a block inventory table (in the order the format actually stores blocks) → one
section per block, in that same order, with a shared "encoding conventions" section defined
once before any section that relies on it → an "out of scope" section at the end for anything
observed but not yet decoded. Define a thing before referencing it; don't make the reader hold
context from far earlier in the file.

## 3. Scaffold the core driver

Create `core/src/devices/<id>/` with:
- `types/` — type definitions split by domain, plus a barrel `index.ts`
- `constants.ts` — ordered lookup arrays, with reverse-index maps derived via
  `Object.fromEntries(list.map((v, i) => [v, i]))`
- `codec/` — the encode/decode pipeline, split into primitives, field codecs, per-block
  codecs, and a top-level patch composer, plus a barrel `index.ts`
- a file-I/O module (`readFile` / `writeFile` / `blankPatch` / `newFile`) — name it after the
  device's own patch-file format, not a borrowed name
- `builder.ts` — high-level, no-"set"-prefix construction helpers (an unknown field key should
  throw rather than write silently)
- `raw.ts` — a unique symbol for stashing a decoded patch's original raw bytes
- `<id>.ts` — the `PatchDriver<T>` implementation; calls `registerDriver` at import time

**Round-trip byte preservation is non-negotiable**: the codec must start from the original raw
bytes and overwrite only the byte indices it has actually decoded. Anything not yet understood
passes through untouched, so an incomplete format spec never corrupts a file.

Register the new driver in `core/src/index.ts` (import for its side effect only).

## 4. Prove the codec round-trips

Commit one real device export, using its own native file extension, as the shared round-trip
baseline for core/cli/mcp tests. Put it at the repo root under `fixtures/<id>/`, not inside
`core/`.

Write byte-for-byte round-trip tests: decode the fixture, re-encode it, and assert the output
bytes match the input exactly. Add targeted tests for individual field codecs and any
lookup-table edge cases (unknown/out-of-range raw values should decode to a clearly-labeled
sentinel rather than throwing).

## 5. Author capabilities metadata

Write `core/src/devices/<id>/capabilities.ts` — a `DeviceCapabilities` object built from the
manual, covering every parameter group the device exposes (effect types, amp/cab models, etc.,
whatever applies). Wire it into the driver object from step 3.

Add two drift guards as tests:
- **Coverage guard**: every id in the device's constant lookup arrays has a matching
  `CapabilityItem` entry, and vice versa.
- **Semantic guard**: for at least the trickiest shared/aliased parameter groups, assert that
  the capability metadata's field list actually matches what the codec reads/writes for that
  type — a params-vs-codec drift is a silent correctness bug, not just a docs gap.

## 6. Wire the presentation layers

- **CLI**: `cli/src/devices/<id>/` with a `command.ts` (read / write / copy / new /
  capabilities commands via the shared device-agnostic command wiring) and a `print.ts`
  (patch pretty-printer). Add one roster line in `cli/src/devices/index.ts`.
- **MCP**: `mcp/src/devices/<id>/` with a `generate_<id>_patch`-style tool plus any zod schemas
  it needs. Add one roster line in `mcp/src/devices/index.ts`.
- **Tests**: behavior tests for both layers — exercise every CLI command and MCP tool against
  the fixture from step 4, including error paths (bad ref, bad field path, unknown device).

No changeset entry is needed purely for adding a new device (no existing published package's
public API changes because of it, unless a shared type in `core/src/types/` had to grow — in
which case changeset only that).

## Reference implementation

The GX-1 driver is the existing device to read for concrete examples of this layout — not to
copy from. Useful pointers:
- `core/docs/gx1/FORMAT.md` — a finished example of the step-2 write-up structure.
- `core/src/devices/gx1/` — a finished example of the step-3/5 file layout.
- `fixtures/gx1/rock-tones.tsl` — a finished example of the step-4 fixture.
- `cli/src/devices/gx1/`, `mcp/src/devices/gx1/` — finished examples of step 6.

A new device's file extension, envelope shape, byte encodings, and terminology will differ from
GX-1's in ways that matter — expect to discover them, not assume them.
