/**
 * Server-onboarding text delivered to every MCP client at initialize (the SDK's
 * `instructions` field). Device-agnostic: the device roster is discoverable at runtime,
 * so nothing here names a specific device.
 */
const instructions = `tonesmith reads, edits, and builds patch files for guitar multi-effects
processors. The server carries the device knowledge — supported devices, their signal blocks,
effects, parameters, and value ranges — so you can build a patch for a device you've never seen.

A device arranges its effects as a signal chain of blocks: order matters, and most blocks can be
turned on or off independently. These tools are the complete interface for working with patch
files, covering the full lifecycle:

1. list_devices — list the supported devices and pick an id.
2. describe_device <device> chain — learn the signal chain first: the default block order, what can
   be reordered, and how blocks are bypassed.
3. describe_device <device> [group] — a block's structure, listed as an index of what it offers;
   drill into one item for that item's parameters, each with its key, range, and allowed values.
4. generate_<device>_patch — build a patch and save it. Set the block order, each block's
   parameters, and its on/off state; the response echoes the full patch and the resolved chain, so
   you confirm the result in one step.
5. read_patch — read a saved patch back to inspect it.
6. write_fields — change one or more fields of a saved patch by dot-path, applied as one batch.

Everything you need to inspect, build, and edit a patch is here.`;

export { instructions };
