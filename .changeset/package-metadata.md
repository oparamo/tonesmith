---
"@tonesmith/core": patch
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Each package says what it is and what it needs. All three carry a description, a README covering
that package's own surface, a copy of the license, and `engines: node >= 24`, which is the only
version any of them is built and tested against.

`@tonesmith/core` no longer ships declaration maps. They pointed at `src/`, which the package
doesn't publish, so every one of them resolved to nothing.
