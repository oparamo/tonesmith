---
"@tonesmith/core": patch
---

A `type` or `subType` in a patch spec or a dot-path edit matches a catalog id exactly, ignoring
case, and never a prefix of a type's display name. An id the block doesn't offer is rejected before
anything is built, naming the id given and the ids that exist. `capabilityService.findType`, which
`describe_device` and the CLI `capabilities` command use to resolve what a person types, keeps its
prefix fallback.
