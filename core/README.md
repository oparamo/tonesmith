# @tonesmith/core

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

console.log(patch.amp.type, patch.amp.gain);

const driver = registry.getDriver(file.device);
```

Building a patch goes through the driver, which validates the spec against the device's own
capability catalog before any byte is written:

```ts
const patch = gx1.driver.buildPatch({
  name: "GLASSY",
  amp: { type: "JC-120", gain: 40, bass: 55, middle: 50, treble: 60 },
  reverb: { type: "HALL M", level: 30 },
});

patchUtils.upsertPatches(gx1.driver, { path: "my-set.tsl", patches: [patch] });
```

A write starts from the bytes the file was read as and overwrites only the indices the codec
knows, so fields this driver has not reverse-engineered survive a round trip untouched. That is
also why `writeFile` refuses a `PatchFile` you assembled by hand: it carries none of those bytes.

## What it exposes

- `registry` — `registerDriver`, `getDriver`, `listDrivers`
- `patchUtils` — `resolvePatch`, `resolvePatches`, `applyFieldEdits`, `upsertPatches`, `copyPatch`,
  `createPatchFile`, `coerceValue`, `setByPath`
- `patchView.presentPatch` — the consumer-facing view of a decoded patch
- `capabilityUtils`: `findGroup`, `findType`
- one namespace per device (`gx1`), publishing its `driver`, its patch and block types, and `RAW`

## License

MIT. See [LICENSE.md](./LICENSE.md).

The project [README](https://github.com/oparamo/tonesmith#readme) covers the CLI, the MCP server,
and how a new device is onboarded.
