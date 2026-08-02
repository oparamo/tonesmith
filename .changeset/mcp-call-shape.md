---
"@tonesmith/mcp": major
---

Building a patch takes a bounded number of calls, and the tool inputs say what they mean.

**`describe_device` takes an `items` list** in place of `group`/`item`. Each entry is `"chain"`, a
group id (`"amp"`), or `"<group>/<item>"` (`"fx/CHORUS"`), split on the first slash so ids that
contain one (`"fx/OD/DS"`) still resolve. The response is keyed by the entry string, so one entry
reads the same as twenty and a whole patch's worth of lookups is a single round trip. One bad entry
fails the call and names itself.

A group listing is an index rather than a full dump. `describe_device gx1 fx` ran to 70,627
characters across 2,585 lines, large enough that some clients refuse the response, which pushed
consumers into one call per item just to see what exists. Each item keeps its id, name, models,
description and subtype ids, and the block's own controls stay attached. Pass `includeParams: true`
for the full payload, or name the items you want.

**`generate_patch` is `generate_gx1_patch`** (generate tools are per device; a fully generic one
waits until the device count justifies it) and it takes `{ outPath, setName?, patches: [ ... ] }`
instead of one patch per call. A whole set goes out in one call and lands in one file write, with
array order becoming the order on the device rather than something the caller has to get right
across N calls. Each patch is echoed back complete with its defaults filled in and its resolved
chain, so the response is the confirmation and no follow-up read is needed. `setName` names the
patch set stored in the file, which is distinct from `outPath`, the filename on disk.

**`write_field` is `write_fields`** and takes a `{dot-path: value}` record instead of a single
field and value pair. The whole set applies in memory before anything is written, so a rejected
edit leaves the file untouched rather than half updated, and one call replaces N
read/decode/encode/write cycles over the same file. It also takes `setName`, so renaming a patch
set no longer means regenerating a patch through the generate tool; `fields` and `ref` are optional
so a rename needs no patch reference, and asking for neither edit is an error rather than a silent
no-op.

**Input names match the decoded field names** shown by `read_patch` and used by `write_fields`
dot-paths. `amp.mid` is `amp.middle`, and `delay.timeMs` and `reverb.timeS` are `delay.time` and
`reverb.time`, with the units documented in each field's description rather than carried in the
field name.

**One uniform params bag.** Every per-type block (fx, pfx, delay, reverb) takes its type-specific
params in a `params` record keyed by each param's `key`; delay and reverb's bag used to be called
`extra`. The rule is one line: if a `describe_device` param's `key` matches a named field on the
block, set that field, otherwise put it in `params[key]`. Passing a named control inside `params`
errors instead of silently overriding the field. These records accept strings and booleans as well
as numbers, which they did not: the many GX-1 params that select a model or mode by name (pedal
WAH's `wahType`, TOUCH WAH's `filter`, SLICER's `pattern`, HARMONIST's `harmony`, delay TWIST's
`mode`, SPACE ECHO's `head`) are `lookup()`-encoded strings in the codec, and a
`z.record(z.string(), z.number())` schema could never build a working patch with any of them.

The server advertises onboarding `instructions` at initialize, delivered automatically to every
client: a device-agnostic account of how many calls the work should take and which shapes get you
there, so a connected agent can build a patch with no other context. It carries a display `title`,
`description` and `websiteUrl` in its identity too.
