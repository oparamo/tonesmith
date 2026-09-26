---
"@tonesmith/mcp": patch
---

`generate_patch`'s description and the server instructions agree on how a patch gets built: two
`describe_device` lookups, then one `generate_patch` call. The instructions say `generate_patch`
saves into its output file by name, replacing a same-named patch and appending the rest.
