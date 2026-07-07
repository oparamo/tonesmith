---
"@tonesmith/core": patch
---

Removed `u16be` and `nibbleTriplet` from the GX-1 codec's field constructors
(`codec/fields.ts`) — dead code with no callers anywhere in `FX_PARAM_MAPS`,
`DELAY_TYPE_MAPS`, or `REV_TYPE_MAPS`; every 16-bit/8-bit value in the actual TSL
format is nibble-encoded (`nibbleQuad`/`nibblePair`), confirmed against
`FORMAT.md`. Neither function was ever re-exported from the public API surface,
so this isn't a breaking change.

No other production behavior changed in this PR — the rest is test suite work:
split the 442-line `codec.test.ts` along `codec/` module lines
(`codec-roundtrip`, `fx-params`, `blocks`), added direct unit tests for
`primitives.ts`/`fields.ts` and the gx1 `driver.ts` wrapper (previously excluded
from coverage), removed a couple of redundant ref-resolution happy-path tests
duplicated between `core`'s exhaustive unit tests and the `cli`/`mcp` integration
suites, relocated the shared `rock-tones.tsl` fixture from `core/tests/fixtures/`
to a package-agnostic root-level `fixtures/gx1/`, and ratcheted all three
workspaces' coverage thresholds up to what's actually achieved (branches now
96–98%, everything else 100%, up from the prior 80/90 floor).
