---
"@tonesmith/core": minor
"@tonesmith/mcp": minor
---

Surface the amp block's speaker and mic, and stop saying the same things repeatedly.

The amp block has always carried a speaker cabinet and a microphone, but neither was in the param
catalog, so neither reached `describe_device`, the CLI, or anything else derived from capabilities.
Looking up the amp block returned every parameter except the two that could not be guessed. They are
now ordinary amp params carrying their allowed values, which makes an `amp/<id>` lookup complete.
A parity exception that had written them off as "covered by their own groups" is gone — having a cab
group never made the amp block's own speaker field discoverable from an amp lookup.

Params on the single-shape blocks (amp, odds, ns, fv) now carry `key`, the field name to write, as
per-type block params already did. The inconsistency previously had to be explained; now it isn't
there.

Agent-facing text has been cut back to one home per rule. Bypass was stated in roughly fourteen
places across the chain view, seven `on` fields, five block wrappers and the generate description;
it is now stated where the concept lives and where the field is. "Batch your lookups into one call"
appeared five times and now appears twice. The generate tool description no longer inlines a copy of
every amp, speaker, mic, delay, reverb and pedal type id — `describe_device` is the one place those
live, and it is the one place that isn't truncated by client display limits. The server instructions
now describe the two-call path agents actually take rather than a four-call one they don't.

No behavior changes: same schemas, same validation, same bytes.
