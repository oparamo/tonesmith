---
"@tonesmith/core": minor
"@tonesmith/cli": minor
"@tonesmith/mcp": minor
---

Every parameter the GX-1 exposes is declared once, and everything else derives from it.

`param-catalog.ts` holds every block and type's params: the name, the value domain, and a
description. Each is declared as `def(name, domain, description)`, where the domain is `num`,
`oneOf`, `lookupOf`, `bool` or `text`. From that one declaration comes the human `range` string,
the machine `values` list, and the numeric `min`/`max` bounds, which used to be three restatements
of the same fact.

`ParamSpec` carries all of it, so a consumer of `describe_device` or the CLI's `capabilities` gets:

- **`key`**, the exact field name to write when building a patch or editing one by dot-path,
  stamped automatically from the codec's field map. No transliterating "PRE-DELAY" into `preDelay`
  by hand.
- **`values`**, the full ordered list of valid labels for every enum param. A compact `range`
  summary like "20 Hz-12.5 kHz, FLAT" could not tell you whether `"2.5kHz"` or `"2.50kHz"` was the
  spelling the codec accepts.
- **`min`** and **`max`** for numeric params.

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

The MCP generate schema reads the catalog rather than repeating it. Numeric bounds come off the
`ParamSpec`, and so does the sentence beside each field: `.describe("Gain 0-120")` sitting next to
a bound that came from the catalog meant a range change updated the enforcement and left the text
quoting the old number, with nothing to catch it because the bound itself stayed correct. That
removed about forty hand-written range strings, and the descriptions an agent reads are fuller than
the strings they replaced, because the catalog carries real prose per param. One rule covers the
whole schema: a field whose valid values are a fixed set that does not depend on another field
names that set in its own description, built from capabilities; a field whose valid set varies by
chosen type does not, because `describe_device` is the only thing that can answer it. So
`amp.type`, `amp.speaker`, `amp.mic`, `odds.type`, `delay.highCut`, `ns.detect` and `fv.curve` name
their full lists in the exact spelling they require, and `subType` and the per-type `params`
records point at `describe_device`.

Supplied values are checked against the chosen type's real range before anything is written. The
flat schema could only bound delay and reverb by a single representative type and left the `params`
bags unchecked, so `ANALOG` with a time of 1201 ms, past its 1200 ms limit, got as far as the
codec's raw byte guard. It is rejected up front now, with a message naming the real range or the
valid keys.

That check is also the only one that bounds delay and reverb, because a representative type cannot
speak for the others. Where each type declares its own range for a shared control, the flat field
carries the union of all of them as an outer gate, so no type's valid values are unreachable:
reverb LEVEL 0 (SHIMMER, TERA ECHO), reverb TIME above 10 (SUB DELAY, whose range is 1-2000 ms),
delay LEVEL 0 (SPACE ECHO, SHIMMER, WARP, TWIST) and delay TIME 0 (GLITCH) would otherwise be
rejected before anything looked at the chosen type. Those fields state no range of their own, since
the union spans units (reverb TIME runs from 0.1 seconds to 2000 milliseconds) and no type accepts
all of it; they point at `describe_device`, which is the only thing that can answer for the type
chosen.

The CLI's `capabilities <group> <item>` prints each param's write `key` and its full `values` list
alongside the label. Without the key there was no way to tell which dot-path `write` expects, and
the exact spellings (`2.5kHz`, `FLAT`) appeared nowhere in the CLI.

Because the catalog and the codec are authored independently, a drift guard checks them against
each other across every block and type, and the MCP schema is checked against the catalog in turn.
