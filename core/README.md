# @tonesmith/core

[![npm](https://img.shields.io/npm/v/@tonesmith/core)](https://www.npmjs.com/package/@tonesmith/core)
[![license](https://img.shields.io/npm/l/@tonesmith/core)](./LICENSE.md)

Read, edit, and build patch files for guitar multi-effects processors.

Every supported device is a self-contained driver behind one `PatchDriver` interface, so the types
and utilities here are the same whichever device a file came from. This package is what
[`@tonesmith/cli`](https://www.npmjs.com/package/@tonesmith/cli) and
[`@tonesmith/mcp`](https://www.npmjs.com/package/@tonesmith/mcp) are built on.

## Supported devices

| Device    | id    | Patch file format |
|-----------|-------|-------------------|
| BOSS GX-1 | `gx1` | `.tsl`            |

## Install

```bash
pnpm add @tonesmith/core
```

## Usage

A file names the driver that reads it, so the registry can hand you one from the file itself.

```ts
import { registry, patchUtils, gx1 } from "@tonesmith/core";

const file = gx1.driver.readFile("rock-tones.tsl");
const { patch } = patchUtils.resolvePatch(file.patches, "SWORD LEAD");

console.log(patch.amp.type, patch.amp.params.gain);

const driver = registry.getDriver(file.device);
```

Building a patch goes through the driver, which validates the spec against the device's own
capability catalog before any byte is written:

```ts
const patch = gx1.driver.buildPatch({
  name: "GLASSY",
  amp: { type: "JC-120", params: { gain: 40, bass: 55, middle: 50, treble: 60 } },
  reverb: { type: "HALL M", params: { level: 30 } },
});

patchUtils.upsertPatches(gx1.driver, { path: "my-set.tsl", patches: [patch] });
```

Every block takes the same shape: `type` where the device offers one, an optional `subType` and
`on`, and one `params` bag holding its controls. That is how a decoded patch reads back and how a
spec is written.

A write starts from the bytes the file was read as and overwrites only the indices the codec
knows, so fields this driver has not reverse-engineered survive a round trip untouched. That is
also why `writeFile` refuses a `PatchFile` you assembled by hand: it carries none of those bytes.

## What it exposes

- `registry`: `registerDriver`, `getDriver`, `listDrivers`
- `patchUtils`: `resolvePatch`, `resolvePatches`, `resolvePatchIndex`, `upsertPatches`, `copyPatch`,
  `createPatchFile`, `MAX_NEW_PATCHES`
- `capabilityUtils`: `findGroup`, `findType`
- the `PatchDriver<T>` interface every device implements, whose methods are how a consumer reads,
  edits, builds and views a patch: `readFile`, `writeFile`, `decodePatch`, `encodePatch`,
  `buildPatch`, `applyEdits`, `viewPatch`, `blankPatch`, `newFile`, and its `capabilities` catalog
- one namespace per device (`gx1`), publishing its `driver`, its patch and block types, and `RAW`

## License

MIT. See [LICENSE.md](./LICENSE.md).

The project [README](https://github.com/oparamo/tonesmith#readme) covers the CLI, the MCP server,
and how a new device is onboarded.
