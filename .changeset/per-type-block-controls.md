---
"@tonesmith/core": major
"@tonesmith/mcp": major
---

A block's named controls are the ones its type actually has.

`delay` and `reverb` expose common controls as named options, but the types disagree about which
they have. TWIST has no TIME or FEEDBACK, GLITCH has no FEEDBACK or LEVEL, WARP has no FEEDBACK or
HIGH CUT, TERA ECHO has no TIME, SUB DELAY has no TONE, PRE-DELAY or DIRECT, and SHIMMER has no
DENSITY or DIRECT. A delay spec required `time`, `feedback` and `level` anyway, and a reverb spec
required `time`, so building one of those types meant inventing values for controls it does not
have, which encode then dropped without a word.

**Breaking:** every control on both blocks is optional, and passing one the chosen type has no field
for is rejected, showing the shape that type does take. Builder callers can still pass a control
both as a named option and in the `params` record, which is rejected rather than letting one of the
two values silently win.

**Breaking:** an unset control now takes the chosen type's factory default, the rule the `params`
record already followed, instead of a value hardcoded in the builder. Two of those hardcoded values
were not the device's: reverb PRE-DELAY defaulted to 0 against a factory 30, and delay HIGH CUT to
FLAT against a factory 6.3 kHz. Callers that set these controls explicitly are unaffected, and an
unset control no longer defaults to a value the device does not ship.
