/**
 * Server-onboarding text delivered to every MCP client at initialize (the SDK's
 * `instructions` field). Device-agnostic: the device roster is discoverable at runtime,
 * so nothing here names a specific device.
 */
const instructions = `tonesmith reads, edits, and builds patch files for guitar multi-effects
processors. It carries the device knowledge you need — the supported devices, their signal
blocks, effects, parameters, and value ranges — so you can build a patch for a device you know
nothing about ahead of time.

A typical flow:

1. list_devices — see the supported devices and pick the id you want.
2. describe_device — with just the device, get its block structure (amp, drive, delay, reverb,
   and so on). Pass a group, and optionally an item, to drill in and see each parameter's key,
   range, and allowed values.
3. generate_<device>_patch — build and save a patch. Each block's type-specific parameters go in
   its \`params\` record, keyed by the parameter keys from describe_device. The response echoes the
   full patch it built and the resolved signal chain.
4. read_patch and write_field — read a saved patch back, and edit a single field by dot-path.

Reach for describe_device whenever you need a device's exact block names, parameter keys, or value
ranges; it's the source of truth the generate and write tools expect you to build against.`;

export { instructions };
