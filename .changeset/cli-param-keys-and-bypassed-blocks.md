---
"@tonesmith/cli": patch
---

Show what the capability and read views were leaving out.

`capabilities <group> <item>` now prints each param's write `key` alongside its label, and the full
`values` list for discrete lookup params. Without the key there was no way to tell which dot-path
`write` expects, and `range` is only a summary for lookups — so the exact spellings (`2.5kHz`,
`FLAT`) never appeared anywhere in the CLI.

`read` no longer hides a bypassed OD/DS block. Every other block prints with `[OFF]` and its
settings, and the device keeps a bypassed block's settings, so hiding it concealed the sound parked
behind the bypass. A patch's `memo` is printed too, when it has one.
