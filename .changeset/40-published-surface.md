---
"@tonesmith/core": major
---

What `@tonesmith/core` publishes is what a consumer is meant to use, and each published type says
what is actually true of the value behind it.

A device namespace publishes its `driver`, its patch and block types, and `RAW`, the key the bytes
this codec doesn't decode are kept under. It used to publish around twenty more names: the builder
functions and their option types, the chain helpers, the param catalog, the codec's fx-type
converters, the spec module's wording helpers, and `NAME_BYTES`, which the device's own
`capabilities.patchName.maxLength` states. None were part of building or editing a patch, all of
which goes through the driver, and each one published a signature that could not then change
without a major version. The type barrel gained the names it was missing in exchange: `PatchNameSpec`
and `PatchSpecExample` had no way to be named, and `FieldEdits` comes with the surface above.

`PatchFile.device` is specified, and it is the driver's id: a consumer holding a file can hand that
field to `registry.getDriver` and get the driver that reads it. It was undocumented, and the GX-1
driver filled it with `"GX-1"`, the device's name for itself in the file format, which the registry
knows nothing about. That name is a fact about the file rather than about the driver and stays in
the file's own raw envelope, which is where the writer takes it from, so no bytes move. The CLI's
`read` header prints the driver's name, which is what that line was showing a person anyway.

`patchUtils.upsertPatches` returns `{ file, created, saved }` rather than the file alone: whether
the save started the file, and for each patch, whether it replaced a same-named patch or was
appended. Its own documented property is that it reads once and writes once however many patches
are saved, and a caller that had to say what the save did could only work it out by reading and
decoding the whole file a second time first, which is what `generate_patch` was doing.

`saveTsl` is gone rather than narrowed. It wrote a file and then called `console.info`, and the MCP
server speaks JSON-RPC over stdio, so a consumer reaching for it inside a tool corrupted the
protocol stream. `patchUtils.upsertPatches` is the supported way to save patches to a file.

`PatchDriver.writeFile` accepts a `PatchFile<T>`, which anyone can assemble by hand, and no driver
can honor that: a write starts from the envelope the file was read as and overwrites only the byte
indices the codec knows, which is what leaves the format's undecoded fields intact. A file that
carries none of those bytes is now refused by name:

```
Cannot write /tmp/set.tsl: this patch file did not come from readFile or newFile, so it carries
none of the original bytes a write starts from.
```

It used to fail as `TypeError: Cannot read properties of undefined (reading 'data')`, and the GX-1
driver reached that point through a cast that laundered the base type into its own. The cast is
gone.
