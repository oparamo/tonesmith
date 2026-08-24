---
"@tonesmith/core": major
"@tonesmith/mcp": major
---

An edit's value keeps the type it was given.

`write_fields` takes a string, a number or a boolean per field, rather than a string only. What
`read_patch` returns for a field is what you can now send back for it: `{"amp.params.gain": 88}` was
rejected by the schema, and every value that did get through was read for the number or boolean it
looked like, so `{"name": "1984"}` set a patch name to the number 1984 and the encoder failed on it
by name.

A value is interpreted against the field it is going into, and left alone where that field already
holds a string. A command line can express a number no other way, which is why the coercion exists
at all, but a patch called "1984" is a name.

`PatchDriver.applyEdits` returns what landed, keyed by path. A caller reporting the values it wrote
was re-running the coercion to work them out, which is a second copy of the rule this release just
changed. `FieldValue` is exported for the value type itself.
