---
"@tonesmith/core": major
---

File I/O is async and lives in `patchUtils`; drivers convert bytes and never touch the disk.

`PatchDriver.readFile` and `writeFile` are replaced by `parseFile(bytes, source)` and
`serializeFile(file)`, which turn a file's bytes into a decoded `PatchFile` and back. Every read and
write goes through `patchUtils`, and every one returns a Promise:

- `readPatchFile(driver, path)` reads and decodes a file.
- `editPatchFile(driver, path, { ref, edits, setName })` applies dot-path edits to one patch and/or
  renames the set in one write, and reports what each edit wrote. A rejected edit leaves the file
  untouched.
- `upsertPatches`, `copyPatch` and `createPatchFile` keep their arguments and results.

```ts
const file = await patchUtils.readPatchFile(gx1.driver, "rock-tones.tsl");
await patchUtils.editPatchFile(gx1.driver, "rock-tones.tsl", {
  ref: "SWORD LEAD",
  edits: [["amp.params.gain", 45]],
});
```

Calls that change the same file take turns, so two edits made at once both land instead of the
second write erasing the first; calls on different files run side by side. Nothing to set up: the
file operations handle it themselves. `createPatchFile` checks that the path is free and writes the
file as one step, so two creates on one path can't both succeed.

A driver no longer has any file I/O to get right, so a new device's format module is two pure
conversions.
