---
"@tonesmith/core": patch
---

Stop reporting edits that were never made.

A dot-path naming a field the device does not have used to be accepted: the value was written onto
the decoded patch, the caller was told `Updated ... = <value>`, and the encoder then dropped it
silently because it only emits known byte indices. `write_fields setName` and `amp.notARealField`
both looked like successful edits while changing nothing, and a path whose root did not exist at
all crashed with a raw `TypeError` instead of a usable message. Every segment of a path must now
exist, and a path that goes wrong names the valid fields at the level it went wrong, so a near miss
like `amp.params.mid` points at `middle`.

`resolvePatchIndex` rejects an index past the end of the file rather than returning it. Callers
index straight into the patch array with the result, so an unchecked index read as `undefined` or,
when writing, left a hole in the array that encoded as a corrupt file.

Which patch a reference picks out now follows the reference's shape rather than `Number`'s idea of
an index, which is wide enough to be dangerous. `Number("")` is 0, and a reference left out by a
caller arrives here as an empty string, so it selected the first patch and, on a write, overwrote
it. `"0x1"` and `"2.0"` rounded into indices nobody spelled out. An index is digits with an optional
sign, an empty reference is refused, and anything else is looked up as a name. Ruling the index out
is also what makes a patch named `"808"` reachable, since a digits-only reference is read as an
index first and falls through to the name when the file has no such slot.

The builders reject an unknown param key for the block's current type, listing the keys that type
does accept (`... is not valid for type "ROTARY" (valid keys: speed, slowRate, ...)`). A key that
means something else for this type used to write its byte anyway.

Three paths inside the codec did the same thing one level lower, returning normally without writing
the bytes they were handed. The FX param encoder gave back the original bytes whenever the effect
type resolved to no field map, so switching `fx1.type` to `DELAY` in the same batch as a param edit
discarded every param in the bag. The NS `detect` and FV `curve` encoders skipped their byte when
the value was not one the device names, so `ns.detect = "BOGUS"` reported `Updated` and changed
nothing. All three throw now, and both selectors go through the same lookup as every other enum in
the codec.

That lookup is also the inverse of the one decode uses, sentinel included. A byte outside a table's
range decodes to `UNKNOWN_<n>`, and that name now encodes back to the byte it came from rather than
throwing, so a value this codec cannot name survives a read and write cycle instead of blocking the
write. `NsBlock.detect` and `FvBlock.curve` are typed `string` to match, as every other decoded
selector already was.

The CLI `write` command and the MCP `write_fields` tool share this pipeline, so all of it applies to
both.
