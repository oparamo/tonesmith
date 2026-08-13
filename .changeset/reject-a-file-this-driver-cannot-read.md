---
"@tonesmith/core": major
---

Say what is wrong with a file instead of failing on the first field that isn't there.

`readFile` cast the parsed JSON to the envelope type and read straight through it, so anything else
handed to it surfaced as `TypeError: Cannot read properties of undefined`, naming neither the file
nor what it was missing. Pointing the CLI or an MCP tool at a JSON file that is not a patch set, or
at another device's patch set, is an ordinary mistake and now gets an ordinary answer:

```
Cannot read /tmp/notes.json: it is not a patch file.
Cannot read /tmp/set.tsl: it holds a GT-1000 patch set, not a GX-1 one.
Cannot read /tmp/set.tsl: patch 2 is missing MEMORY%FV, MEMORY%NS.
```

The list of blocks a patch must carry is read off the blank patch rather than written out a second
time, so a block the codec learns is a block a file is checked for.

The envelope type said `data` held two arrays of parameter sets, which is not its shape: each entry
is a patch, carrying the device's `memo` field alongside its `paramSet`. Two casts existed to bridge
the difference, one on each side of the file. `TslPatch` is now a type of its own, both casts are
gone, and a consumer reading `PatchFile[RAW]` sees the shape the file actually has.

An FX type this codec has no field map for no longer reports an `unknownBytes` key among its params.
The key held a 32-byte copy of the block that nothing ever read back: preservation comes from the
raw bytes every encoder starts from, not from that copy. Such a type now reads as a block with no
params, which is what it is, and its bytes are written back exactly as they were found.
