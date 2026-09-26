---
"@tonesmith/mcp": minor
---

`read_patch`'s paged response carries `nextOffset`, a number, in place of the `more` sentence.

`nextOffset` is present only while patches remain past the page just returned, and is the exact
offset to pass back as `offset` to continue. A caller reading it as data, rather than parsing a
sentence for the number inside it, needs nothing else to page through a file.
