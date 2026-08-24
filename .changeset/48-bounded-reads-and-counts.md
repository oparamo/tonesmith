---
"@tonesmith/core": major
"@tonesmith/mcp": minor
---

Two inputs whose size nothing was watching.

`read_patch` with no `ref` decoded and returned the whole file, at roughly 1.4 KB of JSON per patch,
so pointing it at a full device library answered with hundreds of KB nothing asked for, and clients
that cap a tool result refuse a response that size outright. It now returns the first 20, with
`total` and a `more` line naming the offset to continue from, and takes `limit` (up to 100) and
`offset` to say otherwise. A `ref` still returns exactly that patch.

`patchUtils.createPatchFile` checks its patch count instead of handing it to the driver: a whole
number from 1 to 500, which `create_patch_file` also declares. `patchCount: 1e8` had the server
building a hundred million blank patches while the caller waited, and a count of 0, -1 or 2.5 was
passed through to whatever the driver made of it.
