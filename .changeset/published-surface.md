---
"@tonesmith/core": major
---

What `@tonesmith/core` publishes is what a consumer is meant to use, and each published type says
what is actually true of the value behind it.

`presentPatch` returns a `PatchView<T>` rather than a `T`. The view drops the selector copy a device
mirrors into a block's params, which is a copy the encoder reads to pick that block's field map, so
handing a view back to `encodePatch` would write the block's old sub-model byte and report the write
as done. `PatchDriver.encodePatch` takes an `Encodable<T>` and a view is not one, so the round trip
that would have done it no longer compiles.

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
