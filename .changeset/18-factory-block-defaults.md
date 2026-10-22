---
"@tonesmith/core": major
"@tonesmith/mcp": major
---

The GX-1's `amp`, `drive`, `noiseGate` and `volume` blocks take their unset values from the device's
own factory defaults.

Every control on these four blocks is optional. Only `type` is still required, on the two blocks
that have one, since choosing the model is the point of setting the block. Before this, `amp`
required `gain`, `bass`, `middle` and `treble`, `odds` required `drive`, `tone` and `level`, `ns`
required `threshold` and `release`, and `fv` required `position`, `min` and `max`, which made a
caller invent a value for every knob on a block it only wanted switched on.

Three defaults were wrong, having been written into the builder rather than read off the device:

- amp `LEVEL` defaulted to 100; the device ships it at 50.
- amp `MIC` defaulted to DYN57; the device ships it at DYN421.
- A blank patch opened its amp on at TRNSPRNT, and opened OD/DS all-zeroed, which decodes as
  MID BOOST at drive 0 and tone -50. The device's factory state is every block off, the amp at
  NATURAL, and OD/DS at OVERDRIVE with drive 50, tone 0 and level 50. `create_patch_file`
  documented itself as writing factory defaults and did not.

A patch that leaves amp `level` unset now stores 50 rather than 100, so anything relying on the old
value has to set it explicitly.

The three blocks the codec preserves rather than decodes were zero-filled for the same reason and
now carry the factory bytes too. A blank patch's master block set memory level to 0, which trims the
patch's output to silence, and BPM to 0, below the 40 the device accepts; it opens at level 100 and
120 BPM now, in the key of C with carryover on. The footswitch block and the eight assign slots
likewise open at the device's own values instead of every switch unassigned. Patches read from a
file are unaffected: those bytes have always been preserved as they were found.

The blocks whose controls depend on their type (the three fx slots, delay, reverb and the pedal
effect) opened all-zeroed as well, and a spec that leaves a block out keeps what the blank patch
opened with. A patch built without a reverb stored it at tone -50 and level 0, which is what
switching it on later brought up. A blank patch is now the device's own factory-default patch byte
for byte, name aside: every block off, each at the type the device opens it on, and every type's
factory values in the bytes the block's types share, so a block switched to any type starts at its
factory settings.

The values live in `BLOCK_DEFAULTS`, lifted from the same factory-default export that already backs
`DEFAULTS_BY_TYPE`, and the drift guard checks both against it. The blank patch's bytes are that
export's, checked against it byte for byte.
