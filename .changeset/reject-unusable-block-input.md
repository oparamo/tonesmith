---
"@tonesmith/core": major
"@tonesmith/mcp": major
---

Block input that names a setting the chosen type does not have is now rejected instead of dropped.

A `subType` only means something for a type whose `describe_device` entry lists `subTypes`. Sent to
any other type it reached no byte, so the patch saved without an error and played at the default: a
PHASER given `subType: "4 STAGE"` came back as a 4-stage patch in name only, since PHASER's variant
is its `stage` param. That input is now refused, and the message names the param that does carry the
variant, so the fix is one edit rather than a hunt.

The pedal FX block gains the `subType` it already advertised. `describe_device` has always listed
WAH's six pedal models as subTypes while the generate schema had no field to receive one, leaving
`params.wahType`, a key capabilities never mentions, as the only way to pick a model. `subType` now
works there as it does on an FX slot; `params.wahType` still does too, and setting both is an error
rather than a coin flip.

Every block in `generate_gx1_patch` now rejects fields it doesn't have. An unrecognized field used
to be discarded before validation, so `fx1: { type: "CHORUS", rate: 50 }` built a chorus at the
default rate and reported success.

Builder callers see the same rules: `fx()` and `pfx()` throw on a subType the type cannot carry,
and `pfx()` takes `subType` alongside its existing `params`.
