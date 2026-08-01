---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
---

Describe generate schema params from the param catalog, and add `copy_patch` and `create_patch_file`.

Every numeric field of the generate tool's schema already read its min/max off the catalog's
ParamSpec, but the sentence beside it was typed by hand: `.describe("Gain 0-120")` next to a bound
that came from the catalog. Changing a range updated the enforcement and left the text quoting the
old number, with nothing to catch it, since the bound itself stayed correct. The description is now
composed from the same ParamSpec that supplies the bound, which removes about forty hand-written
range strings and the whole class of drift. Descriptions an agent reads are also fuller than the
strings they replace, because the catalog carries real prose per param. The schema-drift guard now
checks the text alongside the bounds.

`copy_patch` copies a patch into a slot in another file, replacing what is there. `create_patch_file`
starts an empty file of blank patches at the device's factory defaults and refuses to overwrite an
existing one. Both close the gap where the CLI could do something the MCP surface could not, and both
run through new device-agnostic `patchUtils.copyPatch` and `patchUtils.createPatchFile`, which the
CLI's own `copy` and `new` commands now call rather than keeping their own copies of the logic.

`resolvePatchIndex` rejects an index past the end of the file instead of returning it. Callers index
straight into the patch array with the result, so an unchecked index read as `undefined` or, when
writing, left a hole in the array that encoded as a corrupt file.
