---
"@tonesmith/core": major
"@tonesmith/mcp": major
---

GX-1 AMP, OD/DS, NS and FV now take their unset values from the device's own factory defaults.

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

The values live in `BLOCK_DEFAULTS`, lifted from the same factory-default export that already backs
`DEFAULTS_BY_TYPE`, and the drift guard now checks both against it plus the blank patch itself.
