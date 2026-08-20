/**
 * Server-onboarding text delivered to every MCP client at initialize (the SDK's
 * `instructions` field). Device-agnostic: the device roster is discoverable at runtime,
 * so nothing here names a specific device.
 *
 * Written as a bounded procedure rather than a tool inventory. Building a patch is a lookup-heavy
 * job, and left to judgment an agent will make one lookup per effect type, dozens of round trips
 * for a set of values it could have named upfront. The two calls below are what agents actually
 * converge on once the batched shapes exist, so this text describes that path rather than a longer
 * one they would only ignore.
 */
const instructions = `tonesmith reads, edits, and builds patch files for guitar multi-effects
processors. The server carries the device knowledge (supported devices, their signal blocks,
effects, parameters, and value ranges), so you can build a patch for a device you've never seen.

Building patches takes two calls, however many patches you are building:

1. describe_device <device> items: [...] is ONE call naming "chain" plus every group and effect type
   you need. Omit \`items\` to list this device's own group ids, with an example call built from
   them; an entry is a group id, or "<group>/<item>" for one type within a group. "chain" returns
   the device's block order and how bypass works; each other entry returns that item's params with
   their exact key, range, and allowed values, plus an \`example\`: that block's spec at factory
   defaults, which you copy into the call below and change the values you care about. Work the full
   list out first, rather than one call per effect. This is the only source for a device's blocks,
   types and params; no tool schema repeats them.
2. generate_patch takes every patch in the \`patches\` array, in the order you want them on the
   device, with one output path. The response echoes each patch under \`patch\`, complete with the
   defaults it filled in, so that response IS your confirmation: you do not need to read the file
   back to check the write.

list_devices enumerates device ids when you don't already have one. read_patch and write_fields are
for files that already exist: inspecting a patch you did not just create, or amending one by
dot-path.

Two tools cover the rest of the file handling. copy_patch moves a patch into a slot in another file,
replacing what was there. create_patch_file starts an empty file of blank patches at the device's
factory defaults. Neither is part of building a patch from parameters: generate_patch creates and
appends to its own output file, so reach for these only when the goal really is duplicating an
existing patch or opening an empty file.

These tools are the complete interface. Everything you need is here: device knowledge, patch
building, saving, and editing. No shell, file editing, or outside tooling is involved at any
step.`;

export { instructions };
