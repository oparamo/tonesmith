---
"@tonesmith/core": minor
---

Author each param's value range as a **structured domain**, and derive everything from it.

Every catalog param is now declared as `def(name, domain, description)` where the domain is one of
`num`/`oneOf`/`lookupOf`/`text` (see `param-domain.ts`). The human `range` string, the machine
`values` list, and the numeric `min`/`max` bounds all derive from that single declaration instead of
being restated. `ParamSpec` gains `min`/`max`, and `describe_device` now surfaces `values` for every
enum param (previously only the frequency tables carried them) and `min`/`max` for numeric params.

Internally this removes `parseNumericRange` — the MCP generate schema no longer parses an English
range string to recover its bounds; it reads them straight off the ParamSpec. Range/`values`/
description output is unchanged for existing params (verified against a pre-change snapshot); the only
additions are the new `values`/`min`/`max` fields.
