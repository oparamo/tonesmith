# @tonesmith/mcp

## 1.0.0

### Major Changes

- 4b9d4cb: First stable release. The public API of all three packages is frozen from here, and the entries
  below are what a 0.2.0 consumer needs to know about.
  
  The shape that settled: one device-agnostic core carrying the patch model, the file operations and
  the driver registry, with each device a self-contained driver behind `PatchDriver<T>`. The CLI and
  the MCP server are transports over that core rather than places logic lives, so a device reaches
  both surfaces by registering one driver. BOSS GX-1 is the device that ships.
  
  Round-trip byte preservation is the guarantee underneath all of it. Encoding starts from the bytes
  a file already held and overwrites only the indices the codec knows, so format fields nobody has
  reverse engineered yet survive a read and write cycle untouched.
  
  `@tonesmith/mcp` now depends on `@modelcontextprotocol/server` 2.x, the stable line of the split
  v2 packages. That fixes a bug which made the published binary unusable: the v1 SDK's
  `exports` map had no entry for the `server/mcp` and `server/stdio` subpaths the server imports as
  values, so Node's ESM resolver could not resolve them and `tonesmith-mcp` failed to start under
  plain `node`. The server also reports its real package version at initialize rather than a
  hardcoded `0.1.0`.
- 08c8055: Every block takes one shape, and a device's driver is the only thing that knows its format.
  
  **A block is its selectors and one `params` bag**, on the way in and on the way out, for every
  block of every device. `on`, `type` and `subType` are the complete set of keys beside `params`, so a
  device's controls keep whatever names its panel prints, `type` among them, with nothing they can
  collide with. The GX-1 had nine blocks carrying params flat and three fx slots nesting them, and a
  caller working by analogy from one met a rejection on the other. `PatchBlock` in the type barrel is
  the contract, and a conformance suite holds every registered driver to it rather than trusting each
  device's own tests.
  
  **Blocks are named for what they are, not for what the front panel abbreviates them to.** `odds` is
  `drive`, `ns` is `noiseGate`, `fv` is `volume`, and `pfx` is `pedalFx`. The device's own labels are
  still available: `capabilities.chain.blocks` gives every block name its `label`, what is printed on
  the unit and what a manual or a photo shows.
  
  **The chain names blocks the same way a patch spec does.** It read `["PFX", "FX1", "OD/DS", …]`
  while a spec keyed the same blocks `pfx`, `fx1`, `odds`, so three of the ten had to be converted by
  eye. It is one vocabulary now, and the `"OD"` alias is gone with the second spelling it existed for.
  
  **Dot-paths gain a level for the blocks that were flat**: `amp.gain` is `amp.params.gain`. A path
  now says which kind of thing it touches, since `amp.on` is block state and `amp.params.gain` is a
  control.
  
  **A patch read back is a patch that can be sent straight back.** Two things stopped it: a block
  whose type has no variants reads `subType: null`, which the spec validator rejected as not a
  variant name, and `memo`, the device's own note field, was decoded but had no way in. `null` now
  means what leaving `subType` out means, and a spec takes `memo`.
  
  **A block's params are rebuilt on a type change** rather than merged over what was there, so the
  types of one block no longer leave each other's controls behind: a `pitch` left over from SHIMMER
  is not a control SUB DELAY has, and it no longer shows up on one.
  
  `FxParams` is `BlockParams`, since it is every block's params type now. The GX-1 block types are
  `DriveBlock`, `NoiseGateBlock`, `VolumeBlock` and `PedalFxBlock`, and each single-shape block also
  exports its params type.
- 4b9d4cb: The decoded GX-1 patch has one consistent shape, and it is not the 0.2.0 shape.
  
  **Field names are camelCase**, matching the rest of the decoded object rather than the manual's
  display names: `preDelay`, `highCut`, `subType`, `octFeedback`, and so on throughout.
  `describe_device` reports each param's `key`, so the name to write is always available without
  guessing how a display name was transliterated.
  
  **Lookup-shaped fields decode as their labels, not raw byte indices.** Delay and PARA. EQ
  `highCut`, PARA. EQ `lowCut` and `midFreq`, and ENHANCER `lowFreq` and `highFreq` read as
  `"3.15kHz"` where they used to read as `22`. Byte layout is unchanged; only the decoded JSON
  differs. `HIGH_CUT_MAP` and `LOW_CUT_MAP` are no longer exported, since the codec handles labels
  directly.
  
  **On/off params are real booleans.** `trigger` across FEEDBACKER, VIBRATO, S-BEND, the
  WARP/TWIST/GLITCH/REVERSE delay sub-algorithms and TERA ECHO, RING MOD's `intelligent`, and `solo`
  on the amp, the drive block and the FX-slot OD/DS were variously an `"OFF"`/`"ON"` string, a raw
  number, or a boolean depending on where you found them. They are `true`/`false` end to end now, over
  a `boolean` param domain and a validating `bool` codec field.
  
  **`subType` is the only way a model or sub-algorithm is selected**, and it is the only name that
  selection goes by. Ten effects and the pedal-FX block store the selector among their own params
  rather than in a shared header, and the codec exposed it under the param's own name: FIXED WAH's
  model was `wah_type`, and the FX-slot REVERB picked its algorithm through `params.type`. All of them
  are `subType` now, on the way in and on the way out, the newly decoded pedal WAH included. `type` means the block's own selector and nothing else. A decoded block carries the
  selection exactly once: ten effects keep the selector in a param byte, and the codec lifts it onto
  `subType` on the way out and writes it back on the way in, so nothing downstream is handed two
  copies to keep in agreement.
  
  **Blocks and fields that were undecoded now decode**: the `pedalFx` block (expression pedal WAH and
  PEDAL BEND), `solo` and `soloLevel` on both the `amp` block and the FX-slot OD/DS, and
  `patch.key`, the song key HARMONIST resolves its diatonic intervals against.
- 4b9d4cb: The signal chain is a first-class part of the device model, and it is an array everywhere.
  
  `DeviceCapabilities` carries a `ChainSpec` (a description plus the device's default block order)
  that `describe_device` and the CLI's `capabilities chain` surface as their own view. The
  MCP server's onboarding instructions send a connected agent there first, since the chain is what
  the rest of a patch hangs off.
  
  **Breaking:** `generate_patch`'s `chain` input is a `string[]`, first element first in the
  chain, instead of a `">"`-delimited string, and the CLI prints a chain as a comma-separated list.
  
  **Breaking:** the `CHAINS` lookup is gone. It held a handful of preset layouts keyed by
  `">"`-delimited strings, which only covered the arrangements someone had thought to name. Take the
  device's own default order from its capabilities (`capabilities.chain.defaultOrder`, which
  `describe_device` and the CLI's `capabilities chain` both show) and move what you want. Chain arrays
  also no longer carry `INPUT`, `LOOP` and `OUTPUT`: those are fixed endpoints rather than reorderable
  blocks, and the ten blocks that can actually move are the whole array now.
  
  **A chain is the complete block order.** A `chain` names every block exactly once, first to last,
  and a partial list is rejected, naming the blocks left out and the default order to copy and edit. A
  partial list used to be filled in by reinserting each missing block after its default predecessor,
  which could carry a listed block clear to the end of the chain: a two-block list naming the drive
  and the first fx slot resolved to that slot sitting after the reverb. Omitting `chain` entirely
  still takes the default order, and `generate_patch` states the stored order in its response, so a
  caller that omitted it sees what it took.
  
  **Every block bypasses uniformly.** `on: false` turns off any block except `volume`, the foot-volume
  pedal, which is always active. The `clearOdds(patch)` helper is gone with it: it existed because the
  overdrive block was the one with no other way to switch off. A bare `{ on: false }` is accepted on
  any bypassable block, where it used to fail validation demanding `type` and the block's other
  required fields, with an error naming a missing field and no hint that leaving the block out was the
  intended move.
  
  A block's position and its on/off state are separate inputs, and the chain view now says so rather
  than using "omit" for both. To leave a block off, leave its spec out of the patch: it takes no
  params, so nothing has to be invented for a block that isn't sounding. Passing `on: false` alongside
  a full block keeps those params behind the bypass, so it can be switched on later with those
  settings intact.
  
  **Encoding rejects a malformed chain.** The GX-1 stores the chain as a linked list in which each
  block's own slot names its successor, so a chain that repeats a block overwrites that block's slot
  and every block between the two occurrences drops out of the list. The file still encoded and the
  patch came back with blocks silently missing: setting `chain.0` of the default order to `AMP` by
  dot-path collapsed a 10-block chain to 6, losing four of the blocks between the two occurrences, and
  the write reported success. `encodeChain` now requires a list holding every block exactly once, and
  says which block is duplicated or missing.
- 41995db: The patch's own settings are decoded, so a note value has a tempo to play against.
  
  The GX-1 stores five settings for the patch as a whole rather than for any block, and only its
  musical key was decoded. A decoded patch now carries all five at the top level beside `name`:
  `memoryLevel`, `bpm`, `key`, `carryover` and `tempoHold`. Each is readable through `read_patch`,
  settable in a `generate_patch` spec, and writable by dot-path through `write_fields` and the CLI's
  `write`. Without `bpm` a control set to a note value played against a tempo nothing could read or
  change.
  
  `DeviceCapabilities` gains `patchSettings` beside `patchName`, a list of param specs for what a
  device stores per patch. `describe_device`'s `"chain"` entry returns it and the CLI's
  `capabilities chain` prints it, which is what makes these settings discoverable at all: they belong
  to no group, so `key` had been decoded and unlisted. Every driver declares the field, empty where a
  device has no such settings.
  
  Both write paths check a setting against its range and name it in the rejection. A tempo outside
  40-250 previously reached the encoder, which reports a byte index rather than the field a caller
  typed.
- 1ab938a: A tempo-synced value reads as the note it is.
  
  Delay times, pre-delays and modulation rates store either a number or one of eighteen note values,
  which the GX-1 keeps in the codes immediately above each param's numeric ceiling. Those codes now
  decode as their note names, so `delay.params.time` reads `400` or `"1/4"`, and both forms are
  writable through `generate_patch`, `write_fields` and the CLI's `write`. Reading them as numbers
  made a quarter-note delay report 2010 ms, roughly four times what it plays, and a patch read off
  the device was then rejected as out of range when sent back unchanged.
  
  `ParamSpec` gains a `numericOrNamed` kind carrying `min`, `max` and `values` together, for a param
  that takes a number and a set of named settings alike. `describe_device` lists the note values with
  the param, and the CLI's `capabilities` prints them, so the second form is readable up front rather
  than learned from a rejection.
  
  The delay's ANLG MOD type advertised the 12-1200 ms range that belongs to ANALOG. It writes the
  address every other type shares, so its time is 1-2000 ms.
- 7ccfe21: A block's named controls are the ones its type actually has.
  
  `delay` and `reverb` expose common controls, but the types disagree about which they have. TWIST has
  no TIME or FEEDBACK, GLITCH has no FEEDBACK or LEVEL, WARP has no FEEDBACK or HIGH CUT, TERA ECHO
  has no TIME, SUB DELAY has no TONE, PRE-DELAY or DIRECT, and SHIMMER has no DENSITY or DIRECT. A
  delay spec required `time`, `feedback` and `level` anyway, and a reverb spec required `time`, so
  building one of those types meant inventing values for controls it does not have, which encode then
  dropped without a word.
  
  **Breaking:** every control on both blocks is optional, and passing one the chosen type has no field
  for is rejected, showing the shape that type does take.
  
  **Breaking:** an unset control now takes the chosen type's factory default instead of a value
  hardcoded in the builder. Two of those hardcoded values
  were not the device's: reverb PRE-DELAY defaulted to 0 against a factory 30, and delay HIGH CUT to
  FLAT against a factory 6.3 kHz. Callers that set these controls explicitly are unaffected, and an
  unset control no longer defaults to a value the device does not ship.
- 3647896: The GX-1's `amp`, `drive`, `noiseGate` and `volume` blocks take their unset values from the device's
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
- 197b3cf: The capability catalog calls a block's selectable types types.
  
  `CapabilityItem` is `CapabilityType`, and `CapabilityGroup.items` is `CapabilityGroup.types`. The id in that list is the value a patch spec writes as
  `type`, so "item" was a second name for something that already had one, and the type's own doc
  comment described it as "one of the models or types a block offers". An entry also carries
  `subTypes`, which under the old name meant a thing that is not a type has sub-types.
  
  `describe_device` answers a group listing under `types` rather than `items`, and its prose says
  `"<group>/<type>"`. Its **input** field stays `items`: an entry there is `"chain"`, a group id, or
  `"<group>/<type>"`, so it names things to look up rather than types.
  
  The CLI's `capabilities <group> <type>` takes the same argument it always did, now named for what it
  is in `--help`.
- 64112b5: Block input that names a setting the chosen type does not have is now rejected instead of dropped.
  
  A `subType` only means something for a type whose `describe_device` entry lists `subTypes`. Sent to
  any other type it reached no byte, so the patch saved without an error and played at the default: a
  PHASER given `subType: "4 STAGE"` came back as a 4-stage patch in name only, since PHASER's variant
  is its `stage` param. That input is now refused, and the message names the param that does carry the
  variant, so the fix is one edit rather than a hunt. A subType a type has but doesn't recognize is
  refused the same way, naming the variants it does have; it used to reach the codec's lookup and come
  back as `Unknown type value: "..."`, which named neither the block nor the field nor the
  alternatives.
  
  Every block in `generate_patch` now rejects fields it doesn't have. An unrecognized field used
  to be discarded before validation, so `fx1: { type: "CHORUS", rate: 50 }` built a chorus at the
  default rate and reported success.
  
  OVERTONE is refused in an fx slot that cannot hold it, naming the one that can. The GX-1 keeps its
  five controls in a block only FX3 has, so in FX1 or FX2 they were written over the start of the
  shared param block, on top of whatever that slot's COMPRESSOR settings were, and the patch still
  saved and reported success. OVERTONE's `example` in `describe_device` is written under `fx3`.
  
  Every one of these rules is enforced on the way to the bytes rather than at the tool boundary, so
  the CLI and the MCP server reject the same input for the same reason.
- 9e8dcd6: An edit's value keeps the type it was given.
  
  `write_fields` takes a string, a number or a boolean per field, rather than a string only. What
  `read_patch` returns for a field is what you can now send back for it: `{"amp.params.gain": 88}` was
  rejected by the schema, and every value that did get through was read for the number or boolean it
  looked like, so `{"name": "1984"}` set a patch name to the number 1984 and the encoder failed on it
  by name.
  
  A value is interpreted against the field it is going into, and left alone where that field already
  holds a string. A command line can express a number no other way, which is why the coercion exists
  at all, but a patch called "1984" is a name.
  
  `PatchDriver.applyEdits` returns what landed, keyed by path. A caller reporting the values it wrote
  was re-running the coercion to work them out, which is a second copy of the rule this release just
  changed. `FieldValue` is exported for the value type itself.
- f7aaee8: A dot-path write can switch a block's effect type.
  
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
- 4b9d4cb: Building a patch takes a bounded number of calls, and the tool inputs say what they mean.
  
  **`describe_device` takes an `items` list** in place of `group`/`item`. Each entry is `"chain"`, a
  group id (`"amp"`), or `"<group>/<type>"` (`"fx/CHORUS"`), split on the first slash so ids that
  contain one (`"fx/OD/DS"`) still resolve. The response is keyed by the entry string, so one entry
  reads the same as twenty and a whole patch's worth of lookups is a single round trip. One bad entry
  fails the call and names itself.
  
  A group listing is an index rather than a full dump. `describe_device gx1 fx` ran to 70,627
  characters across 2,585 lines, large enough that some clients refuse the response, which pushed
  consumers into one call per type just to see what exists. Each type keeps its id, name, models,
  description and subtype ids, and the block's own controls stay attached. Pass `includeParams: true`
  for the full payload, or name the types you want.
  
  **Omitting `items` answers with every group and every type id in it.** An entry has to name a type
  exactly, and a summary reporting only how many types a group held could not be acted on: the ids
  came from a per-group listing, so seeing what a device offers cost one call per block before any
  params could be asked for. The ids are the cheap half of a listing, roughly 1.7 KB against the 27 KB
  those listings run to, so the first call now carries the vocabulary the second one names.
  
  Nothing in the tool schemas names a device any more. `describe_device` carried one device's id as
  the example device, listed that device's group ids as though every device had them, and printed a
  hand-written `items` example naming its effects, which on any other device demonstrates a call that
  fails. The summary's example is built from the catalog in hand, and the descriptions say what an
  entry is shaped like.
  
  **Naming a type returns an `example`**: a spec fragment for that block at factory defaults, keyed
  by the block's own name, ready to copy into `generate_patch` and edit. A list of param keys says
  what a control is called but not where it goes, and the answer differs by block, so a caller
  mirroring one block's shape onto another met a rejection on its first call. Blocks with no types to
  choose between carry the example on the group, their only view. A group index leaves it out, since
  naming a type is what asks for that detail.
  
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
  and each entry in `patches` says whether it replaced a same-named patch or was appended. A block's
  shape, meaning the fields it takes and their bounds, is validated by the device's own driver against
  its capability catalog rather than declared in the tool schema, so `describe_device` is where that
  detail lives.
  
  **`write_field` is `write_fields`** and takes a `{dot-path: value}` record instead of a single
  field and value pair. The whole set applies in memory before anything is written, so a rejected
  edit leaves the file untouched rather than half updated, and one call replaces N
  read/decode/encode/write cycles over the same file. It also takes `setName`, so renaming a patch
  set no longer means regenerating a patch through the generate tool; `fields` and `ref` are optional
  so a rename needs no patch reference, and asking for neither edit is an error rather than a silent
  no-op.
  
  **Input names match the decoded field names** shown by `read_patch` and used by `write_fields`
  dot-paths. `mid` is `middle`, and delay's `timeMs` and reverb's `timeS` are both `time`, with the
  units documented in each field's description rather than carried in the field name.
  
  **A block's params are declared nowhere in the tool schema.** One fx slot takes any of 39 effects,
  and a schema variant per type and subtype would cost roughly 35 KB on every request against a
  `describe_device` lookup paid once, so `generate_patch` takes a permissive `patches` array and the
  device's driver checks each entry against its own catalog, block by block, enforcing the same rules
  a per-type schema would. Params take strings and booleans as well as numbers, which they did not:
  the many GX-1 params that select a model or mode by name (TOUCH WAH's `filter`, SLICER's `pattern`,
  HARMONIST's `harmony`, delay TWIST's `mode`, SPACE ECHO's `head`) are `lookup()`-encoded strings in
  the codec, and an input restricted to numbers could never build a working patch with any of them. A
  key the chosen type has no field for is rejected with the shape that type does take, printed with
  `type` filled in, so nesting is shown rather than described.
  
  Pedal WAH's model is chosen by `subType`, alongside the fx slots and the way capabilities advertises
  it. It reads back under that name too, so the block you get from `read_patch` is a block you can
  send straight back.
  
  The server advertises onboarding `instructions` at initialize, delivered automatically to every
  client: a device-agnostic account of how many calls the work should take and which shapes get you
  there, so a connected agent can build a patch with no other context. It carries a display `title`,
  `description` and `websiteUrl` in its identity too.
- 8ba9b0e: One response envelope across the MCP tools, and agent-facing text that names no device.
  
  `read_patch` answers `{ setName, index, patch }`, and its paged form carries each patch as
  `{ index, patch }` beside `setName`, `total`, `offset` and `nextOffset`. `generate_patch` reports each saved patch as
  `{ name, action, patch }`. The patch is no longer spread across the response's own keys, so a block
  named `index` or `setName` cannot shadow what the tool reports, and an agent that reads a patch and
  then generates one meets one shape rather than two. The hoisted `chain` is gone from
  `generate_patch`, since the echoed patch already carries the order it was stored in.
  
  The tool descriptions and the server's onboarding instructions no longer illustrate themselves with
  one device's blocks, params and effect types, which were wrong for every other device. `write_fields`
  states the dot-path shape (`<block>.params.<control>`, and `on` / `type` / `subType` on the block)
  that every device presents, and the instructions point at `describe_device` for the ids instead of
  listing any.

### Minor Changes

- 9772b20: Each entry of `capabilities.chain.blocks` describes the block rather than only naming its label:
  `{ label, group, bypass }`. `group` is the capability group listing the block's types and controls,
  which is how a consumer learns that the GX-1's `fx1`, `fx2` and `fx3` all take the `fx` group's
  effects. `bypass` is false for a block the device keeps on at all times, which takes no `on`. A type
  only some of its group's blocks offer lists them under `blocks`: the GX-1's OVERTONE names `fx3`.
  All three facts were in the chain's prose before; now a consumer can read them as data.
  `describe_device` returns them with the chain, and the CLI's `capabilities chain` prints each block
  with its label and group.
- 4b9d4cb: Every parameter the GX-1 exposes is declared once, and everything else derives from it.
  
  The GX-1's param catalog holds every block and type's params: the name, the value domain, and a
  description. Each is declared as `def(name, domain, description)`, where the domain is `num`,
  `oneOf`, `lookupOf` or `bool`. From that one declaration comes the human `range` string, the machine
  `values` list, and the numeric `min`/`max` bounds, which used to be three restatements of the same
  fact.
  
  `ParamSpec` carries all of it, as a union of the kinds a param can be rather than a bag of
  optional fields where `{min, max, values, boolean}` all at once still compiled. Every param states
  its **`kind`**, so a consumer of `describe_device` or the CLI's `capabilities` reads one field
  instead of inferring the answer from which others are present, and a driver validating a value
  switches on it instead of walking a presence chain:
  
  - **`numeric`** carries **`min`** and **`max`**, plus **`decimals`** on the few params that take
    fractional values. Reverb TIME runs 0.1-10.0 s while PRE-DELAY's 0-200 is whole milliseconds, and
    the bounds alone cannot tell those apart.
  - **`discrete`** carries **`values`**, the full ordered list of valid labels. A compact `range`
    summary like "20 Hz-12.5 kHz, FLAT" could not tell you whether `"2.5kHz"` or `"2.50kHz"` was the
    spelling the codec accepts.
  - **`boolean`** is a real toggle, taking `true` or `false`. It was the one kind a consumer had to
    identify by reading `range` as English.
  - **`numericOrNamed`** carries both bounds and `values`, for a tempo-synced param that takes a
    number or a note value.
  
  Every kind carries **`key`**, the exact field name to write when building a patch or editing one by
  dot-path, stamped automatically from the codec's field map. No transliterating "PRE-DELAY" into
  `preDelay` by hand.
  
  Each type also carries an **`example`**: the spec that builds its block at the device's factory
  defaults, keyed by the block's own name. A key alone says what a control is called and never where
  it goes. The example is what a caller copies and edits, so it doubles as a statement of what each
  control is left at when you omit it.
  
  Where a type offers a choice of models, the example names the one the device opens on, harvested
  from the factory-default export the way the param values are. A model selection sits beside `type`
  rather than among the params, which the subtype list alone never showed, and naming the first entry
  in that list instead would have put a value the device never chose in a fragment presented as its
  factory state.
  
  `capabilities.ts` derives each type's params from the catalog rather than restating them, which
  makes delay and reverb **per type**: `describe_device` with `items: ["reverb/SHIMMER"]` answers for SHIMMER
  instead of returning one flat list for the whole block. The FX-slot DELAY gained the same
  treatment, so its WARP, TWIST and GLITCH sub-algorithms carry the trigger, mode, rise-fall, glitch
  and balance fields that were previously unmodeled. Drilling into a type returns the block-level
  controls that apply to it as well, so `"amp/JC-120"` no longer comes back with no
  params at all on the grounds that amp's gain, bass, middle and treble live on the group.
  
  The amp block's speaker cabinet and microphone are ordinary catalog params now. They were neither,
  so an amp lookup returned every parameter except those two with nothing to say the answer was
  incomplete. The `cab` and `mic` groups, which describe each cabinet and microphone, say they are
  set through `amp.params.speaker` and `amp.params.mic`, since a patch has no block of either name. Capability lists were corrected wherever else they had drifted from the codec: FIXED
  WAH's `FREQ` is `MANUAL`, the dedicated Delay block never had the `DIRECT` it advertised, several
  FX types were under-reporting `DIRECT` and other params, and the cabinet list was missing its
  `USER1` through `USER8` entries.
  
  The device's driver reads the catalog to validate `generate_patch` input at runtime, rather than a
  schema repeating it field by field. The param's `kind` says what a value must be, `values` says
  which strings are legal, and `decimals` says whether a fraction is legal for a numeric field, since
  a bound alone cannot say whether 4.5 is legal, only whether it is in range.
  
  The driver checks supplied values against the chosen type's real range before anything is written.
  `ANALOG` with a time of 1201 ms, past its 1200 ms limit, used to get as far as the codec's raw byte
  guard. It is rejected up front now, by the bound `describe_device` already gave the caller for that
  field.
  
  Declaring bounds per type is also what makes every documented value reachable. One field serving
  every type could carry no bound but the union of theirs, in units no single type uses: reverb TIME
  would have run 0.1 (seconds, for the halls) to 2000 (milliseconds, for SUB DELAY). Reverb LEVEL 0
  (SHIMMER, TERA ECHO), reverb TIME above 10 (SUB DELAY), delay LEVEL 0 (SPACE ECHO, SHIMMER, WARP,
  TWIST) and delay TIME 0 (GLITCH) are each the device's own range for that type, and each is now
  declared as such.
  
  The CLI's `capabilities <group> <type>` prints each param's write `key` and its full `values` list
  alongside the label. Without the key there was no way to tell which dot-path `write` expects, and
  the exact spellings (`2.5kHz`, `FLAT`) appeared nowhere in the CLI.
  
  Because the catalog and the codec are authored independently, a drift guard checks them against
  each other across every block and type. The validator reads the catalog rather than restating it,
  so there is no third copy to drift.
- 9e8dcd6: Two inputs whose size nothing was watching.
  
  `read_patch` with no `ref` decoded and returned the whole file, at roughly 1.4 KB of JSON per patch,
  so pointing it at a full device library answered with hundreds of KB nothing asked for, and clients
  that cap a tool result refuse a response that size outright. It now returns the first 20 with
  `total`, and takes `limit` (up to 100) and `offset` to say otherwise. While patches remain past the
  page, the response carries `nextOffset`, the exact offset to pass back as `offset` to continue. A
  `ref` still returns exactly that patch.
  
  `patchService.createPatchFile` checks its patch count instead of handing it to the driver: a whole
  number from 1 to 500, which `create_patch_file` also declares. `patchCount: 1e8` had the server
  building a hundred million blank patches while the caller waited, and a count of 0, -1 or 2.5 was
  passed through to whatever the driver made of it.
- 4b9d4cb: `copy_patch` and `create_patch_file` close the gap where the CLI could do something the MCP surface
  could not. `copy_patch` copies a patch into a slot in another file, replacing what is there.
  `create_patch_file` starts an empty file of blank patches at the device's factory defaults and
  refuses to overwrite an existing one.
  
  Both run through new device-agnostic `patchService.copyPatch` and `patchService.createPatchFile`, which
  the CLI's own `copy` and `new` commands call rather than keeping a second copy of the logic.
  
  Saving a patch creates any missing parent directories rather than failing on a path whose folder
  does not exist yet, and `generate_patch` upserts into its output file by patch name rather than
  overwriting the whole file.
- 9e8dcd6: Each tool registration says what it does to a file, and what to call it.
  
  Every one now carries annotations: `list_devices`, `read_patch` and `describe_device` are read-only;
  `write_fields`, `copy_patch` and `generate_patch` can replace what is already there;
  `create_patch_file` writes but refuses an existing file; and none of the seven reach the network. A
  client deciding what needs approval had only the tool name to go on, and by that measure
  `create_patch_file` reads as the dangerous one when it is the only write that cannot lose anything.
  
  The four writes are also marked idempotent: repeating a call with the same arguments changes
  nothing more, so a client can retry one safely. Every tool carries a `title`, the name a client
  shows for it in place of the snake_case id.
- 25f8b07: The server offers one prompt, `build_patch`, which clients that support prompts show as a slash
  command. It takes the `device` (completed from the supported ids as you type), a `description` of
  the tone, and the `outPath` to save it in, and hands the agent a request to build that patch. The
  agent follows the same two-lookups-and-one-build path the server instructions describe.
- 9772b20: A tool error's text is the failure's message alone, with no `Error: ` prefix: a thrown error
  reaches the client through the MCP SDK's own error response, flagged `isError`.

### Patch Changes

- 1bce1e8: A patch spec no longer has to name an amp.
  
  `MEMORY%AMP` byte 0 is the amp's own on/off, the same byte every other bypassable block carries, so
  the device runs a patch with the amp switched off. Requiring one was a judgment about what a patch
  ought to be for rather than anything the hardware enforces, and it refused two shapes the device is
  fine with: a spec that leaves the block out, and `amp: { on: false }` on its own, which was rejected
  for having no `type` on a block it was switching off. Both now build the same patch, with the amp
  off at the device's factory defaults, exactly as every other omitted block already did.
  
  An amp that is on still needs a `type`, which is the rule for every block with models and not an
  amp rule. `volume`, the foot-volume pedal, remains the one block that cannot be bypassed, because it
  has no on/off byte to write.
  
  This makes the capability metadata true: `describe_device`'s chain summary already told callers
  that every block but `volume` can be switched off by leaving its spec out.
- a0730fb: `DeviceCapabilities` gains a required `patchName: { maxLength }`, stating the longest patch name the
  device stores. A driver that doesn't declare it no longer type-checks. It is required rather than
  optional deliberately: the name limit belongs to no capability group, so it is the one device fact a
  driver can omit without anything noticing, and that is exactly how the GX-1's came to be wrong.
  
  `describe_device` reports it in the device summary and under `items: ["chain"]`, so it is readable
  before a patch is built rather than discoverable by having one rejected afterwards.
  
  **GX-1:** patch names may now be up to 16 characters, the full width the format stores. The generate
  tool rejected anything longer than 13, a limit with no source behind it. The name field is 16 bytes,
  the codec always wrote all 16, and the device's own parameter tables agree, so the cap only ever
  removed characters callers were entitled to.
  
  A 17th character is refused rather than dropped. The codec used to cut the name to fit and report
  the write as done, so a name that came back shorter than the one sent looked like a display quirk.
  A name using characters the device cannot show, such as `Café`, is refused the same way and names
  the characters it cannot store.
  
  Reading and writing a patch also leaves a name alone that this codec did not author. Both directions
  ran through Node's `"ascii"`, which masks the top bit, so any byte above `0x7F` in a name decoded as
  a different character and was written back as that one, changing a file that was only ever read.
  They use `"latin1"` now, which is identical below `0x80` and byte-exact above it.
- 303d555: The capability text says which block to reach for when the device offers the same effect twice.
  
  The GX-1 exposes overdrive in two places: the dedicated `drive` block, and the `OD/DS` entry in the
  `fx` group's effect list, carrying the same 35 pedal models. Both are valid, and the fx slot is how
  a player stacks a second overdrive on the first. Nothing said so, though, so a caller could put a
  patch's only overdrive in FX1, get a working patch built around the wrong block, and see no error to
  notice it by.
  
  Both descriptions now state the choice where a caller meets it. Browsing the fx effect list says the
  dedicated block carries the same models and is where a patch's overdrive belongs; the `drive` group
  says the fx slots carry them too, for a second overdrive in the chain. Nothing about what is
  accepted has changed, and the text lives in `describe_device`, so it costs nothing in `tools/list`.
- 4b9d4cb: Logic the CLI and the MCP server had each written for themselves lives in `@tonesmith/core`, and
  neither surface is tied to a particular device any more.
  
  Added to core: `capabilityService.findGroup` and `findType`; `patchService.resolvePatch` and
  `resolvePatches` (the patch a ref names and the index it sits at, one patch or the whole file). Each
  replaced a pair of near-identical implementations, one per surface, which is also why the CLI's
  `read` stopped printing `type=<model>` in an fx slot's params line when the label already shows the
  model.
  
  `capabilityService.lookup(caps, groupId, typeId?)` resolves what the CLI's `capabilities` and MCP's
  `describe_device` both answer: the chain, a group, or one type. A type comes with its block's own
  controls ahead of its params, and the chain with the patch name limit and the patch settings. Both
  surfaces match `chain` in either case, the way they match group ids, and both refuse a type under
  the chain. `CHAIN_ENTRY` is the name the chain answers to.
  
  `configureDeviceCommands(cmd, driver)` builds the CLI's commands from a `PatchDriver<T>` rather
  than from GX-1 specifically, and the MCP server registers its device-agnostic tools once. Adding a
  device means adding a `core/src/device/<id>/` folder and one line in the core roster, with no
  change to shared code and no file of its own under `cli/` or `mcp/`. The shared
  commands and tools describe themselves without naming any one device's file format, since ".tsl"
  is GX-1's, not a property of the layer above it.
- 9e8a36c: What a dot-path means is the device's own knowledge, so the driver is what answers it.
  
  `PatchDriver.applyEdits(patch, edits)` takes the edits as `[path, value]` pairs, applies them in
  the order given, and returns what each one wrote keyed by path. `patchUtils.setByPath` and
  `coerceValue` are gone: they split a path on `.` and walked the decoded object literally, so the
  path vocabulary was the decoded shape and nothing about the device was consulted.
  
  A path the device has no field for is now reported alongside every value the device cannot store,
  rather than thrown on its own before the rest of the batch is looked at. One rejected write answers
  with everything wrong with it, which is what a caller fixing it needs. The batch is still all or
  nothing: nothing reaches the file unless every edit in it is usable.
  
  `FieldEdit` is exported for the `[path, value]` pair, and `FieldEdits`, the record of what landed,
  is keyed to `FieldValue` rather than `unknown`.
- ea9cda7: The patch `generate_patch` echoes back is the patch the file holds.
  
  A TERA ECHO reverb has no `time`, `density` or `preDelay`, and a SHIMMER reverb has no `density` or
  `direct`; the echo carries none of them, and neither does a read of the saved file. `buildPatch`
  returns a patch exactly as a file stores it, and the echo is the patch `upsertPatches` saved, so the
  response is the confirmation the tool promises and no follow-up read is needed.
  
  Every spec is built before the file is read, so a spec the driver rejects fails the call with the
  file as it was, naming the spec's position and name.
  
  A batch that names the same patch twice is rejected, naming the name and both positions.
  `patchService.upsertPatches` keys on the name, so the second patch would replace the first and the
  response would report two saves into a file holding one of them.
- 69b91ad: MCP tool responses are now minified.
  
  Every one of these responses is JSON read by an agent, never by hand, so the indented output was
  spending bytes nothing benefited from. Size also has a failure mode here: a client that persists an
  oversized tool result to a file, then refuses to read that file back for exceeding the same limit,
  turns one large lookup into a call the caller cannot recover. A 30-entry `describe_device` batch,
  the scale the server's own instructions tell agents to work in, returned 57.3 KB and hit exactly
  that. The same batch is now 34.2 KB.
  
  Response content is unchanged.
- 9a46c22: Each package says what it is and what it needs. All three carry a description, a README covering
  that package's own surface, and a copy of the license.
  
  `@tonesmith/cli` and `@tonesmith/mcp` declare `engines: node >= 24`, the target both are bundled
  for. `@tonesmith/core` declares none: it imports `node:fs` and `node:path` and uses no API newer
  than the rest, so a version floor there would restrict a library on nothing.
  
  `@tonesmith/core` no longer ships declaration maps. They pointed at `src/`, which the package
  doesn't publish, so every one of them resolved to nothing.
- 5718074: Each package's README documents the package it ships with, and its npm page carries the links a
  visitor looks for.
  
  `@tonesmith/core`'s usage examples now run. Its `buildPatch` example wrote a block's controls as
  fields on the block, which the validator rejects, and its read example reached for `patch.amp.gain`
  where a decoded block keeps its controls under `params`. Its "what it exposes" list named four
  functions that are not exported (`patchService.applyFieldEdits`, `coerceValue`, `setByPath`, and
  `patchView.presentPatch`) and left out the `PatchDriver` methods that replaced them. It also states
  the block shape once, since that is what both corrected examples turn on.
  
  `@tonesmith/cli`'s write example reached for `amp.gain` the same way, and the README now covers what
  writing a block's `type` does to the controls already in it.
  
  `write_fields` is documented as what it is on both surfaces that list it: a dot-path edit batch that
  also renames the patch set, with `ref` and `fields` optional so a rename names neither a patch nor a
  field.
  
  Every manifest gains `keywords`, `homepage` and `bugs`, so an npm page carries working Homepage and
  Issues links and the packages turn up in a search. Each README opens with a version and a license
  badge, and the two packages that declare a node floor carry one for it.
- 0b362e3: Every em dash is out of the text these packages emit.
  
  The GX-1 capability descriptions carried most of them, and those ship straight through
  `describe_device` and the `capabilities` command into what an agent or a player reads. The rest were
  in MCP tool descriptions, the server's onboarding instructions, and the error messages both surfaces
  raise. Each one is restructured rather than swapped for a shorter dash, so the sentences read the
  same way they always did.
  
  Three messages changed shape while their content stayed put: the chain codec's rejection of an
  unknown, repeated, or missing block, the CLI's confirmation after `write`, and the MCP
  `generate_patch` save summary.
- a927d03: Patch files are now written minified. These files are read by the device and by tooling, never by
  hand, and the device's own exports are minified already, so the indented output was spending bytes
  nothing benefited from: the committed `rock-tones.tsl` fixture drops from 79.8 KB to 22.8 KB.
  
  Decoded patch content is unchanged, and files written by earlier versions still read back correctly.
- 9772b20: `generate_patch`'s description and the server instructions agree on how a patch gets built: two
  `describe_device` lookups, then one `generate_patch` call. The instructions say `generate_patch`
  saves into its output file by name, replacing a same-named patch and appending the rest.
- Updated dependencies [4b9d4cb]
- Updated dependencies [08c8055]
- Updated dependencies [4b9d4cb]
- Updated dependencies [9772b20]
- Updated dependencies [4b9d4cb]
- Updated dependencies [41995db]
- Updated dependencies [1ab938a]
- Updated dependencies [7ccfe21]
- Updated dependencies [1bce1e8]
- Updated dependencies [4b9d4cb]
- Updated dependencies [3647896]
- Updated dependencies [4b9d4cb]
- Updated dependencies [4b9d4cb]
- Updated dependencies [a0730fb]
- Updated dependencies [303d555]
- Updated dependencies [197b3cf]
- Updated dependencies [9e8dcd6]
- Updated dependencies [64112b5]
- Updated dependencies [9e8dcd6]
- Updated dependencies [4b9d4cb]
- Updated dependencies [4b9d4cb]
- Updated dependencies [9e8dcd6]
- Updated dependencies [9e8dcd6]
- Updated dependencies [4b9d4cb]
- Updated dependencies [4b9d4cb]
- Updated dependencies [9772b20]
- Updated dependencies [a0730fb]
- Updated dependencies [9772b20]
- Updated dependencies [9e8a36c]
- Updated dependencies [f7aaee8]
- Updated dependencies [7932aac]
- Updated dependencies [9e8dcd6]
- Updated dependencies [9e8dcd6]
- Updated dependencies [25f8b07]
- Updated dependencies [9772b20]
- Updated dependencies [4b9d4cb]
- Updated dependencies [ea9cda7]
- Updated dependencies [4b9d4cb]
- Updated dependencies [9a46c22]
- Updated dependencies [5718074]
- Updated dependencies [0b362e3]
- Updated dependencies [a927d03]
- Updated dependencies [9772b20]
- Updated dependencies [9772b20]
- Updated dependencies [9772b20]
  - @tonesmith/core@1.0.0

## 0.2.0

### Minor Changes

- 30f4684: Initial public release: TypeScript monorepo toolkit for reading, editing, and building BOSS GX-1 `.tsl` patch files. Includes core codec library, CLI, and MCP server.

### Patch Changes

- Updated dependencies [e58c1d1]
- Updated dependencies [30f4684]
  - @tonesmith/core@0.2.0
