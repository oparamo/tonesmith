---
"@tonesmith/mcp": patch
---

Name every fixed value set in the field that takes it, derived from capabilities.

One rule now covers the whole generate schema: a field whose valid values are a fixed set that
doesn't depend on another field names that set in its own description, built from capabilities so it
can't drift; a field whose valid set varies by chosen type doesn't, because `describe_device` is the
only place that can answer it. That draws the line cleanly around `subType` and the per-type `params`
records, which stay where they were.

Four treatments had accumulated behind that. `fx`, `delay`, `reverb` and `pfx` type ids were already
derived. `ns.detect` and `fv.curve` restated their catalog values as hand-typed prose, which would
have silently lied the moment the device's values changed. `odds.type` offered five examples out of
thirty-five real pedal types, and `delay.highCut` two of its frequencies — a format one agent
reported as unguessable without a separate lookup. `amp.type`, `amp.speaker` and `amp.mic` named no
values at all, which cost a `describe_device` round trip per patch to rediscover ids.

Also restores the bypass hint on the bypassable block wrappers. It was cut as duplication of the
chain view's explanation, but it sits where the choice is actually made: without it, callers filled
in blocks they meant to leave off, inventing values for required fields instead of omitting the
block.

The drift guard now covers amp, cab, mic and odds ids alongside the ones it already checked, and
pins that every delay type shares one HIGH CUT table — which is what lets a single representative
type speak for the flat `highCut` field.
