---
"@tonesmith/mcp": patch
---

Name every fixed value set in the field that takes it, derived from capabilities.

One rule now covers the whole generate schema: a field whose valid values are a fixed set that
doesn't depend on another field names that set in its own description, built from capabilities so it
can't drift; a field whose valid set varies by chosen type doesn't, because `describe_device` is the
only place that can answer it. That draws the line cleanly around `subType` and the per-type `params`
records, which stay where they were.

`amp.type`, `amp.speaker`, `amp.mic` and `odds.type` now name their full model lists rather than a
handful of examples or nothing at all, and `delay.highCut` names every frequency it accepts, in the
exact spelling it requires. `ns.detect` and `fv.curve` read their values from the catalog instead of
restating them, so they can no longer disagree with the device.

The drift guard covers amp, cab, mic and odds ids alongside the ones it already checked, and pins
that every delay type shares one HIGH CUT table — which is what lets a single representative type
speak for the flat `highCut` field.
