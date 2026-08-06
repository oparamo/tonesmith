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
- **`min`** and **`max`** for numeric params, plus **`decimals`** on the few that take fractional
  values. Reverb TIME runs 0.1-10.0 s while PRE-DELAY's 0-200 is whole milliseconds, and the bounds
  alone cannot tell those apart.
- **`boolean`** on params carried as real toggles. A numeric param is recognizable by its bounds and
  a discrete one by its `values`, so without this a toggle was the one kind a consumer had to
  identify by reading `range` as English.

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
whole schema: a field whose valid values are a fixed set names that set itself, built from
capabilities, and only a set that genuinely cannot be known in advance points at `describe_device`.
So `amp.type`, `amp.speaker`, `amp.mic`, `odds.type`, `ns.detect` and `fv.curve` name their full
lists in the exact spelling they require, every per-type block's fields carry the chosen type's own
bounds and values, and an fx slot's `subType` and `params` are what point at `describe_device`,
since one slot serves 39 effects.

Supplied values are checked against the chosen type's real range before anything is written, and
for the per-type blocks the schema is what checks them. `ANALOG` with a time of 1201 ms, past its
1200 ms limit, used to get as far as the codec's raw byte guard. It is rejected up front now, by the
bound the caller could read on the field it filled in.

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
each other across every block and type, and the MCP schema is checked against the catalog in turn.
