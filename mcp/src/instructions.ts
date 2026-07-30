/**
 * Server-onboarding text delivered to every MCP client at initialize (the SDK's
 * `instructions` field). Device-agnostic: the device roster is discoverable at runtime,
 * so nothing here names a specific device.
 *
 * Written as a bounded procedure rather than a tool inventory. Building a patch is a lookup-heavy
 * job, and left to judgement an agent will make one lookup per effect type — dozens of round trips
 * for a set of values it could have named upfront. The batched shapes below exist to make the whole
 * job a handful of calls, so this text leads with how many calls the work should take.
 */
const instructions = `tonesmith reads, edits, and builds patch files for guitar multi-effects
processors. The server carries the device knowledge — supported devices, their signal blocks,
effects, parameters, and value ranges — so you can build a patch for a device you've never seen.

A device arranges its effects as a signal chain of blocks: order matters, and most blocks can be
turned on or off independently.

Building patches takes four calls, however many patches you are building:

1. list_devices — pick a device id.
2. describe_device <device> items: ["chain"] — the default block order, what reordering does, and
   how blocks are bypassed. Read this before choosing any block order.
3. describe_device <device> items: [...] — ONE call listing every group and effect type you need,
   e.g. ["amp", "ns", "fx/COMPRESSOR", "fx/TREMOLO", "delay/ANALOG", "reverb/HALL M"]. Each entry
   returns that item's params with their exact key, range, and allowed values. Work out the full
   list first and fetch it in a single call — do not call this once per effect.
4. generate_<device>_patch — pass every patch in the \`patches\` array, in the order you want them
   on the device, with one output path. The response echoes each patch complete with defaults filled
   in and its resolved chain, so that response IS your confirmation: you do not need to read the
   file back to check the write.

read_patch and write_fields are for files that already exist — inspecting a patch you did not just
create, or amending one by dot-path. Neither is part of building a patch.

These tools are the complete interface. Everything you need — device knowledge, patch building,
saving, and editing — is here, and no shell, file editing, or outside tooling is involved at any
step.`;

export { instructions };
