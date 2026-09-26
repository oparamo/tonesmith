---
"@tonesmith/core": patch
---

Reject a file that is not JSON at all the same way every other unreadable file is rejected: naming
the file.

```
Cannot read /tmp/notes.txt: it is not valid JSON.
```

Previously this case surfaced whatever `SyntaxError` `JSON.parse` happened to throw, which names
neither the file nor that the driver is the one refusing it.
