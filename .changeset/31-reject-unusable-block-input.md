---
"@tonesmith/core": major
"@tonesmith/mcp": major
---

Block input that names a setting the chosen type does not have is now rejected instead of dropped.

A `subType` only means something for a type whose `describe_device` entry lists `subTypes`. Sent to
any other type it reached no byte, so the patch saved without an error and played at the default: a
PHASER given `subType: "4 STAGE"` came back as a 4-stage patch in name only, since PHASER's variant
is its `stage` param. That input is now refused, and the message names the param that does carry the
variant, so the fix is one edit rather than a hunt. A subType a type has but doesn't recognize is
refused the same way, naming the variants it does have; it used to reach the codec's lookup and come
back as `Unknown type value: "..."`, which named neither the block nor the field nor the
alternatives.

The pedal FX block gains the `subType` it already advertised. `describe_device` has always listed
WAH's six pedal models as subTypes while `generate_patch` had no way to set one, leaving
`params.wahType`, a key capabilities never mentions, as the only way to pick a model.

Every block in `generate_patch` now rejects fields it doesn't have. An unrecognized field used
to be discarded before validation, so `fx1: { type: "CHORUS", rate: 50 }` built a chorus at the
default rate and reported success.

OVERTONE is refused in an fx slot that cannot hold it, naming the one that can. The GX-1 keeps its
five controls in a block only FX3 has, so in FX1 or FX2 they were written over the start of the
shared param block, on top of whatever that slot's COMPRESSOR settings were, and the patch still
saved and reported success. `describe_device` said "FX3 only" in prose while handing back an
`example` written under `fx1`, so following the example was the way to hit it; the example now
names `fx3`.

Every one of these rules is enforced on the way to the bytes rather than at the tool boundary, so
the CLI and the MCP server reject the same input for the same reason.
