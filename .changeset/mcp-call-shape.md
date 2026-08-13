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

Nothing in the tool schemas names a device any more. `describe_device` carried one device's id as
the example device, listed that device's group ids as though every device had them, and printed a
hand-written `items` example naming its effects, which on any other device demonstrates a call that
fails. The summary's example is built from the catalog in hand, and the descriptions say what an
entry is shaped like. Two other tools pointed at "the device's generate tool", which has not existed
since `generate_patch` replaced it.

**Naming an item returns an `example`**: a spec fragment for that block at factory defaults, keyed
by the block's own name, ready to copy into `generate_patch` and edit. A list of param keys says
what a control is called but not where it goes, and the answer differs by block, so a caller
mirroring one block's shape onto another met a rejection on its first call. Blocks with no types to
choose between carry the example on the group, their only view. A group index leaves it out, since
naming an item is what asks for that detail.

**`generate_patch` takes a `device` argument, a `patches` array, and `setName`.** The 0.2.0 tool was
gx1-only and took one patch per call with no `device` argument. One tool now builds patches for any
device the server supports: a whole set goes out in one call and lands in one file write, with array
order becoming the order in the file rather than something the caller has to get right across N
calls. Each patch is echoed back complete with its defaults filled in and the chain it was stored
with, so the response is the confirmation and no follow-up read is needed. `setName` names the patch
set stored in the file, distinct from `outPath`, the filename on disk.

The response is one JSON object, `{ summary, file: { path, setName, total, created }, patches }`,
rather than a prose line with a JSON array stuck to the end of it, which a consumer could only read
by finding the first `[`. `file` says where the set stands after the write without reading it back,
and each entry in `patches` says whether it replaced a same-named patch or was appended. A block's shape, meaning the
fields it takes and their bounds, is validated by the device's own driver against its capability
catalog rather than declared in the tool schema, so `describe_device` is where that detail lives.

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

**Params go where the decoded patch keeps them.** `pfx`, `delay` and `reverb` take their params as
fields on the block, which is how `read_patch` returns them and how `write_fields` addresses them by
dot-path. An fx slot keeps a `params` record keyed by each param's `key`, because one slot takes any
of 39 effects and a variant per type and subtype would cost roughly 35 KB of tool schema on every
request, against a `describe_device` lookup paid once. `generate_patch`'s own schema declares
neither shape: the device's driver checks each entry against its own catalog, block by block,
enforcing the same rules a per-type schema used to. Both shapes take strings and booleans as well as
numbers, which they did not: the many GX-1 params that select a model or mode by name (TOUCH WAH's
`filter`, SLICER's `pattern`, HARMONIST's `harmony`, delay TWIST's `mode`, SPACE ECHO's `head`) are
`lookup()`-encoded strings in the codec, and an input restricted to numbers could never build a
working patch with any of them. A key the chosen type has
no field for is rejected with the shape that type does take, printed with `type` filled in, so
nesting is shown rather than described.

Pedal WAH's model is chosen by `subType`, alongside the fx slots and the way capabilities advertises
it. It reads back under that name too, so the block you get from `read_patch` is a block you can
send straight back.

The server advertises onboarding `instructions` at initialize, delivered automatically to every
client: a device-agnostic account of how many calls the work should take and which shapes get you
there, so a connected agent can build a patch with no other context. It carries a display `title`,
`description` and `websiteUrl` in its identity too.
