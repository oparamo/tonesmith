---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
---

Fix a PHASER data-corruption bug and unify on/off params, both found dogfooding patch generation.

**PHASER `stage` corruption.** The codec modeled the stage selector with a bespoke numeric formula
(`decode raw*2+2`, `encode (value-2)>>1`) while the catalog declared it a `4 STAGE`/`8 STAGE`/
`12 STAGE` enum. Passing the documented string produced `NaN` and silently wrote a garbage byte,
and the formula itself was wrong (byte 0 decoded to a nonsensical `2` rather than `4 STAGE`). It's
now a plain contiguous enum `lookup` (byte 0/1/2 = 4/8/12 STAGE) that round-trips the label and
validates on encode, matching the device's actual encoding.

**On/off params unified as booleans.** Every on/off toggle (`trigger` across FEEDBACKER, VIBRATO,
S-BEND, RING MOD `intelligent`, the WARP/TWIST/GLITCH/REVERSE delay sub-algorithms, TERA ECHO; and
`solo` on amp/odds/OD-DS) was inconsistently stored as an `"OFF"`/`"ON"` string, a raw number, or a
boolean. They are now real booleans (`true`/`false`) end to end — a new `boolean` param domain and a
validating `bool` codec field — the honest, unmisspellable representation for a binary toggle.
`read_patch`/`describe_device` report them uniformly, and the fx/pfx/delay/reverb `params` bag now
accepts booleans.

**Representation-parity guard.** A new auto-derived drift guard asserts every per-type catalog
param's domain kind matches its codec field's kind (boolean↔`bool`, enum↔`lookup` with equal value
tables, numeric↔numeric). It replaces the hand-curated enum/frequency parity lists, so a catalog
enum backed by a mistyped codec field (the class of bug above) can no longer ship for any effect.
