---
"@tonesmith/mcp": patch
---

`generate_gx1_patch`'s `delay.type`, `reverb.type`, and `pfx.type` field descriptions listed their
valid values as hardcoded, complete-looking enumerations that could silently go stale the next
time a delay/reverb/pfx type is added to capabilities.ts (the schema itself is a plain `z.string()`
for these fields — core validates the real value — so the description text was the only
client-visible source of truth for what's valid). These now derive from `gx1.driver.capabilities`
at call time, the same way the tool's top-level type catalog and `fx1`/`fx2`/`fx3`'s type list
already did, so they can't drift. Added a drift-guard test
(`mcp/tests/schema-drift.test.ts`) asserting every current delay/reverb/pfx type id appears in the
tool's client-visible schema.

No other production behavior changed in this PR — the rest is test-readability cleanup: a few
`.map()` results (`core/tests/patch-utils.test.ts`, `mcp/tests/describe-device.test.ts`) and one
CLI printer helper (`cli/src/common/capabilities-print.ts`) now extract into a named variable
before use instead of nesting the call inline in an assertion/template literal.
