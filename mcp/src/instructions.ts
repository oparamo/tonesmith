/**
 * Server-onboarding text delivered to every MCP client at initialize (the SDK's
 * `instructions` field). Device-agnostic: the device roster is discoverable at runtime,
 * so nothing here names a specific device.
 *
 * Written as a bounded procedure rather than a tool inventory. Building a patch is a lookup-heavy
 * job, and left to judgement an agent will make one lookup per effect type — dozens of round trips
 * for a set of values it could have named upfront. The two calls below are what agents actually
 * converge on once the batched shapes exist, so this text describes that path rather than a longer
 * one they would only ignore.
 */
const instructions = `tonesmith reads, edits, and builds patch files for guitar multi-effects
processors. The server carries the device knowledge — supported devices, their signal blocks,
effects, parameters, and value ranges — so you can build a patch for a device you've never seen.

Building patches takes two calls, however many patches you are building:

1. describe_device <device> items: [...] — ONE call naming "chain" plus every group and effect type
   you need, e.g. ["chain", "amp", "ns", "fx/COMPRESSOR", "delay/ANALOG", "reverb/HALL M"]. "chain"
   returns the device's block order and how bypass works; each other entry returns that item's params
   with their exact key, range, and allowed values. Work the full list out first — not one call per
   effect.
2. generate_<device>_patch — pass every patch in the \`patches\` array, in the order you want them
   on the device, with one output path. The response echoes each patch complete with defaults filled
   in and its resolved chain, so that response IS your confirmation: you do not need to read the
   file back to check the write.

list_devices enumerates device ids when you don't already have one. read_patch and write_fields are
for files that already exist — inspecting a patch you did not just create, or amending one by
dot-path.

These tools are the complete interface. Everything you need — device knowledge, patch building,
saving, and editing — is here, and no shell, file editing, or outside tooling is involved at any
step.`;

export { instructions };
