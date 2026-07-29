---
"@tonesmith/core": patch
"@tonesmith/mcp": minor
---

Stop `write_fields` reporting edits it didn't make, and let it rename a patch set.

A dot-path naming a field the device doesn't have used to be accepted: the value was written onto
the decoded patch, the tool reported `Updated ... = <value>`, and the encoder then dropped it
silently because it only emits known byte indices. `write_fields setName` and `amp.notARealField`
both looked like successful edits while changing nothing, and a path whose root didn't exist at all
crashed with a raw `TypeError` instead of a usable message. `setByPath` now requires every segment
to exist and names the valid fields at whichever level the path went wrong, so a near miss like
`amp.mid` points at `middle`. This also covers the CLI `write` command, which shares the same
mutation pipeline.

`write_fields` gained a `setName` input for renaming the patch set — previously the only way to
change it was to regenerate a patch through `generate_gx1_patch`. `fields` and `ref` are now
optional so a rename needs no patch reference, and asking for neither edit is an error rather than
a silent no-op.

`read_patch` now reports `setName` when reading a single patch. It already did so when returning
every patch, which left the single-patch response unable to show which set the patch belonged to or
to confirm a rename.
