---
"@tonesmith/core": patch
---

Fix two GX-1 codec enum tables whose values had drifted from the device's real parameters, and
add a drift guard so enum-value drift can't recur.

- **FEEDBACKER `MODE`**: the codec decoded mode as `PITCH / BRUSH / SCREEM`; the device's two
  modes are `NORMAL / OSC`. A real FEEDBACKER patch decoded mode index 0 as `"PITCH"` when the
  device means `"NORMAL"`, and index 2 (`"SCREEM"`) was an invalid value the device never
  produces. Corrected to `["NORMAL", "OSC"]` — matching the parameter guide and the catalog
  (which was already correct).
- **HUMANIZER `VOWEL1`/`VOWEL2`**: the codec's vowel table had 10 entries
  (`a,e,i,o,u,A,E,I,O,U`); the device has 5 (`a,e,i,o,u`). The uppercase half were phantom values
  the device can't select. Corrected to `["a", "e", "i", "o", "u"]`.

Round-trip stays byte-identical (the codec preserves the raw byte index; no committed patch ever
used the phantom values). Both were found by auditing every codec `lookup()` enum's entry count
against the device's parameter address table (`max`), corroborated against the parameter guide —
the count check the prior name-only drift guard couldn't perform.

New guard: a `codec ↔ catalog` **enum-value** parity test asserts that discrete-enum lookup
tables (mode/filter/polarity/vowel/trigger selectors) equal their catalog `range` verbatim, so a
mislabeled table fails the suite. Quantized-numeric frequency tables and compact-range enums are
excluded by design.
