---
"@tonesmith/core": patch
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Each package says what it is and what it needs. All three carry a description, a README covering
that package's own surface, and a copy of the license.

`@tonesmith/cli` and `@tonesmith/mcp` declare `engines: node >= 24`, the target both are bundled
for. `@tonesmith/core` declares none: it imports `node:fs` and `node:path` and uses no API newer
than the rest, so a version floor there would restrict a library on nothing.

`@tonesmith/core` no longer ships declaration maps. They pointed at `src/`, which the package
doesn't publish, so every one of them resolved to nothing.
