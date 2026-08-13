---
"@tonesmith/mcp": minor
---

Each tool registration says what it does to a file.

Every one now carries annotations: `list_devices`, `read_patch` and `describe_device` are read-only;
`write_fields`, `copy_patch` and `generate_patch` can replace what is already there;
`create_patch_file` writes but refuses an existing file; and none of the seven reach the network. A
client deciding what needs approval had only the tool name to go on, and by that measure
`create_patch_file` reads as the dangerous one when it is the only write that cannot lose anything.
