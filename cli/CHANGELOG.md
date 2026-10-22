# @tonesmith/cli

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
- 7932aac: How a patch is displayed is device knowledge, so the driver supplies it and the CLI only renders it.
  
  `PatchDriver.viewPatch(patch)` returns a `PatchView`: the patch's name, whatever the device stores
  about the patch itself as `details`, and its blocks in the order this patch runs them, each carrying
  the device's own panel label, the key a spec and a dot-path edit take, its bypass state, its type
  and sub-model, and its params. `PatchView`, `BlockView` and `PatchDetail` are exported with it.
  
  The CLI is now device-agnostic end to end. `cli/src/devices/` is gone, one printer walks whatever
  `viewPatch` returns, and the program builds itself over `registry.listDrivers()`, so a device that
  ships later needs no file under `cli/` at all. What a person sees changes with it: the blocks follow
  the patch's own chain order rather than a fixed one, each block header names its key beside the
  panel label (`OD/DS [drive]`), and every param prints under the key that writes it, so `Mid=55` is
  `middle=55` and a printed line can be typed back into `write`.
- 4b9d4cb: Fixes to reading, editing and starting patch files from the command line.
  
  `new` takes `--set-name` and `--count` in place of two positional operands. A count sat in the
  second slot behind a set name, so `new tones.tsl 8` named the set "8" and asking for eight blank
  patches meant naming the set as well. A `--count` that is not a whole number is a usage error now,
  rather than a `NaN` that opened the file with no patches in it.
  
  Boolean field writes (`amp.on`, `amp.params.solo`, `pedalFx.on`) were silently corrupted: a
  `"true"` or `"false"` string passed straight through to `Number()` and landed as `NaN`. Both coerce
  to real booleans now.
  
  `write` takes fully qualified `field=value` pairs (`key=G`) instead of a separate `<block>`
  argument, so it can target top-level `Patch` scalars, matching what the MCP tool always accepted.
  `write` reports each value as the driver wrote it, so `amp.params.gain=045` reports
  `amp.params.gain=45`. A pair with no `=` in it is rejected naming the argument as typed: `write f.tsl 0 amp.params.gain`
  sliced at index -1 and reported `amp.params.gai` as an unknown field while listing `gain` among the
  valid ones.
  
  `read` no longer hides a bypassed OD/DS block. Every other block prints with `[OFF]` and its
  settings, and the device keeps a bypassed block's settings, so hiding it concealed the sound parked
  behind the bypass. A patch's `memo` prints too, when it has one.
  
  **`tonesmith --version` reports the version** instead of failing as an unknown option.
  
  **`capabilities` treats the chain like the groups it is listed beside.** It matched `chain`
  case-sensitively while every real group matches either case, so `capabilities CHAIN` failed with a
  list that did not mention chain; and `capabilities chain bogus` printed the chain while
  `capabilities amp bogus` errored. Both now behave the way the neighboring groups do. The chain
  view shows the patch name limit alongside the settings the patch carries itself.
  Every param `capabilities` prints carries its `write` key, a block's own controls and a
  sub-algorithm's params included, where only a type's params and the patch settings carried one.
  
  **Color is gated on a terminal reading the output.** The escape sequences were unconditional, so
  `capabilities fx > types.txt` filled the file with them and a pipe carried them into whatever read
  next. They are emitted only when stdout is a TTY and `NO_COLOR` is unset.
  
  **A failing command sets the exit code rather than calling `process.exit`**, so output piped into
  another command finishes flushing instead of arriving truncated.

### Patch Changes

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
