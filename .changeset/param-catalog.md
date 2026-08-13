---
"@tonesmith/core": minor
"@tonesmith/cli": minor
"@tonesmith/mcp": minor
---

Every parameter the GX-1 exposes is declared once, and everything else derives from it.

`param-catalog.ts` holds every block and type's params: the name, the value domain, and a
description. Each is declared as `def(name, domain, description)`, where the domain is `num`,
`oneOf`, `lookupOf` or `bool`. From that one declaration comes the human `range` string, the machine
`values` list, and the numeric `min`/`max` bounds, which used to be three restatements of the same
fact.

`ParamSpec` carries all of it, as a union of the three kinds a param can be rather than a bag of
optional fields where `{min, max, values, boolean}` all at once still compiled. Every param states
its **`kind`**, so a consumer of `describe_device` or the CLI's `capabilities` reads one field
instead of inferring the answer from which others are present, and a driver validating a value
switches on it instead of walking a presence chain:

- **`numeric`** carries **`min`** and **`max`**, plus **`decimals`** on the few params that take
  fractional values. Reverb TIME runs 0.1-10.0 s while PRE-DELAY's 0-200 is whole milliseconds, and
  the bounds alone cannot tell those apart.
- **`discrete`** carries **`values`**, the full ordered list of valid labels. A compact `range`
  summary like "20 Hz-12.5 kHz, FLAT" could not tell you whether `"2.5kHz"` or `"2.50kHz"` was the
  spelling the codec accepts.
- **`boolean`** is a real toggle, taking `true` or `false`. It was the one kind a consumer had to
  identify by reading `range` as English.

Every kind carries **`key`**, the exact field name to write when building a patch or editing one by
dot-path, stamped automatically from the codec's field map. No transliterating "PRE-DELAY" into
`preDelay` by hand.

Each block also carries an **`example`**: the spec that builds it at the device's factory defaults,
keyed by the block's own name. A key alone says what a control is called and never where it goes,
and the GX-1 does not keep them all in one place: an fx slot nests its controls under `params` the
way the decoded patch does, while amp, delay and reverb carry theirs as fields. That was learnable
only by being rejected, at which point the patch was already built. The example is what a caller
copies and edits, so it doubles as a statement of what each control is left at when you omit it.

Where a type offers a choice of models, the example names the one the device opens on, harvested
from the factory-default export the way the param values are. A model selection sits beside `type`
rather than among the params, which the subtype list alone never showed, and naming the first entry
in that list instead would have put a value the device never chose in a fragment presented as its
factory state.

`capabilities.ts` derives each item's params from the catalog rather than restating them, which
makes delay and reverb **per type**: `describe_device gx1 reverb SHIMMER` answers for SHIMMER
instead of returning one flat list for the whole block. The FX-slot DELAY gained the same
treatment, so its WARP, TWIST and GLITCH sub-algorithms carry the trigger, mode, rise-fall, glitch
and balance fields that were previously unmodeled. Drilling into an item returns the block-level
controls that apply to it as well, so `describe_device gx1 amp JC-120` no longer comes back with no
params at all on the grounds that amp's gain, bass, middle and treble live on the group.

The amp block's speaker cabinet and microphone are ordinary catalog params now. They were neither,
so an amp lookup returned every parameter except those two with nothing to say the answer was
incomplete. Capability lists were corrected wherever else they had drifted from the codec: FIXED
WAH's `FREQ` is `MANUAL`, the dedicated Delay block never had the `DIRECT` it advertised, several
FX types were under-reporting `DIRECT` and other params, and the cabinet list was missing its
`USER1` through `USER8` entries.

The device's driver reads the catalog to validate `generate_patch` input at runtime, rather than a
schema repeating it field by field. The param's `kind` says what a value must be, `values` says
which strings are legal, and `decimals` says whether a fraction is legal for a numeric field, since
a bound alone cannot say whether 4.5 is legal, only whether it is in range.

The driver checks supplied values against the chosen type's real range before anything is written.
`ANALOG` with a time of 1201 ms, past its 1200 ms limit, used to get as far as the codec's raw byte
guard. It is rejected up front now, by the bound `describe_device` already gave the caller for that
field.

Declaring bounds per type is also what makes every documented value reachable. One field serving
every type could carry no bound but the union of theirs, in units no single type uses: reverb TIME
would have run 0.1 (seconds, for the halls) to 2000 (milliseconds, for SUB DELAY). Reverb LEVEL 0
(SHIMMER, TERA ECHO), reverb TIME above 10 (SUB DELAY), delay LEVEL 0 (SPACE ECHO, SHIMMER, WARP,
TWIST) and delay TIME 0 (GLITCH) are each the device's own range for that type, and each is now
declared as such.

The CLI's `capabilities <group> <item>` prints each param's write `key` and its full `values` list
alongside the label. Without the key there was no way to tell which dot-path `write` expects, and
the exact spellings (`2.5kHz`, `FLAT`) appeared nowhere in the CLI.

Because the catalog and the codec are authored independently, a drift guard checks them against
each other across every block and type. The validator reads the catalog rather than restating it,
so there is no third copy to drift.
