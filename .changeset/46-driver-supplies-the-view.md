---
"@tonesmith/core": major
"@tonesmith/cli": minor
---

How a patch is displayed is device knowledge, so the driver supplies it and the CLI only renders it.

`PatchDriver.viewPatch(patch)` returns a `PatchView`: the patch's name, whatever the device stores
about the patch itself as `details`, and its blocks in the order this patch runs them, each carrying
the device's own panel label, the key a spec and a dot-path edit take, its bypass state, its type
and sub-model, and its params. `PatchView`, `BlockView` and `PatchDetail` are exported with it.

The CLI is now device-agnostic end to end. `cli/src/devices/` is gone, one printer walks whatever
`viewPatch` returns, and the program builds itself over `registry.listDrivers()`, so a device that
ships later needs no file under `cli/` at all. What a person sees changes with it: the blocks follow
the patch's own chain order rather than a fixed one, each block header names its key beside the
panel label (`OD/DS [drive]`), and every param prints under the key that writes it, so `Mid=55` is
`middle=55` and a printed line can be typed back into `write`.
