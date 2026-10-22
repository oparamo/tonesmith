---
"@tonesmith/core": major
"@tonesmith/cli": major
"@tonesmith/mcp": major
---

A dot-path write can switch a block's effect type.

`PatchDriver.applyEdits` re-seeds a block to the device's factory settings for the selection it now
carries, as the edit that changed the selection lands. A batch that switches a type and sets a
control of the new type in one call is accepted: the control is a field of the block by the time the
path naming it resolves. Paths still resolve in the order given, so a control named before the type
that has it is rejected.

Switching a type discards the block's current controls, and the block arrives on the device's
factory sub-model. Those are the controls of the effect it has stopped being: left in place, they
are what the codec reads back under the new type's field map, so a compressor's sustain byte came
back as a delay time nobody chose. A sub-model that decides which controls a block has re-seeds on
the same terms; one that is a model variant over its type's shared controls keeps their values.

A block whose types all share one set of controls, such as an amp, keeps them through a type change.
