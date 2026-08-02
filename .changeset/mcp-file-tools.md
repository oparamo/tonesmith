---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
---

`copy_patch` and `create_patch_file` close the gap where the CLI could do something the MCP surface
could not. `copy_patch` copies a patch into a slot in another file, replacing what is there.
`create_patch_file` starts an empty file of blank patches at the device's factory defaults and
refuses to overwrite an existing one.

Both run through new device-agnostic `patchUtils.copyPatch` and `patchUtils.createPatchFile`, which
the CLI's own `copy` and `new` commands call rather than keeping a second copy of the logic.

Saving a patch creates any missing parent directories rather than failing on a path whose folder
does not exist yet, and `generate_gx1_patch` upserts into its output file by patch name rather than
overwriting the whole file.
