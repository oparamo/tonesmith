---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
---

Make patches easier to build and describe from the MCP surface alone (no source-reading):

- **`ParamSpec.key`** — each per-type param now carries `key`, the exact field name used in
  decoded patches (`read_patch` output) and inside a block's `params` record when building. It's
  stamped automatically from the codec field map, so a consumer never has to guess "PRE-DELAY" →
  `preDelay` or "OCT F-BACK" → `octFeedback`. `describe_device` surfaces it.
- **One uniform params bag + a single destination rule** — every per-type block (fx/pfx/delay/
  reverb) now takes its type-specific params in a `params` record keyed by `key` (delay/reverb's
  bag was previously named `extra`). fx/pfx have no named fields, so `params` holds everything;
  delay/reverb keep their common controls as named fields and `params` holds the rest. The rule:
  *if a describe_device param's `key` matches a named field, set that field; otherwise put it in
  `params[key]`.* Passing a common control inside `params` now errors instead of silently
  overriding the named field.
- **Consistent input names** — `amp.mid` is renamed to `amp.middle` to match its decoded field
  name.
- **`generate_gx1_patch` echoes the saved patch** — the response now includes the decoded patch
  JSON (resolved chain + every defaulted field), so a caller can confirm the result without a
  follow-up `read_patch`.
- **Self-teaching errors** — an unknown `params` key now lists the valid keys for that type
  (`… is not valid for type "ROTARY" (valid keys: speed, slowRate, …)`).

Note: `generate_gx1_patch` input renames (`amp.mid` → `amp.middle`, delay/reverb `extra` →
`params`) are breaking for callers of that tool.
