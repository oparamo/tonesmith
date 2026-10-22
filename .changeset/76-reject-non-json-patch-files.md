---
"@tonesmith/core": patch
---

A gx1 file that isn't JSON at all is rejected the way every other unreadable file is, with an
error that names the file: `Cannot read /tmp/notes.txt: it is not valid JSON.`
