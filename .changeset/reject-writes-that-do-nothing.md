---
"@tonesmith/core": patch
---

Stop reporting edits that were never made.

A dot-path naming a field the device does not have used to be accepted: the value was written onto
the decoded patch, the caller was told `Updated ... = <value>`, and the encoder then dropped it
silently because it only emits known byte indices. `write_fields setName` and `amp.notARealField`
both looked like successful edits while changing nothing, and a path whose root did not exist at
all crashed with a raw `TypeError` instead of a usable message. `setByPath` requires every segment
to exist and names the valid fields at whichever level the path went wrong, so a near miss like
`amp.mid` points at `middle`.

`resolvePatchIndex` rejects an index past the end of the file rather than returning it. Callers
index straight into the patch array with the result, so an unchecked index read as `undefined` or,
when writing, left a hole in the array that encoded as a corrupt file.

The builders reject an unknown param key for the block's current type, listing the keys that type
does accept (`... is not valid for type "ROTARY" (valid keys: speed, slowRate, ...)`). A key that
means something else for this type used to write its byte anyway.

The CLI `write` command and the MCP `write_fields` tool share this pipeline, so all three apply to
both.
