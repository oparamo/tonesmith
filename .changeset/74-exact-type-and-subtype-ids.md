---
"@tonesmith/core": patch
---

A `type` or `subType` in a patch spec or a dot-path edit is matched against the catalog exactly,
case-insensitive, never by a prefix of a type's display name. Writing `slot1.type=ECH` used to
build against ECHO's fields silently; it is now rejected, naming the id given and the ids that
exist. `capabilityService.findType`, which `describe_device` and the CLI `capabilities` command
use to resolve what a person types, keeps its prefix fallback.
