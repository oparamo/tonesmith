---
"@tonesmith/core": patch
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Patch files are now written minified. These files are read by the device and by tooling, never by
hand, and the device's own exports are minified already, so the indented output was spending bytes
nothing benefited from: the committed `rock-tones.tsl` fixture drops from 79.8 KB to 22.8 KB.

Decoded patch content is unchanged, and files written by earlier versions still read back correctly.
