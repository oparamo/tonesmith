---
"@tonesmith/core": minor
"@tonesmith/cli": patch
"@tonesmith/mcp": patch
---

Flatten `registry.getDriver` to throw a descriptive error (listing registered device ids) instead
of returning `undefined`; delete the now-redundant `requireDriver`. This is a breaking change for
any direct `getDriver` caller relying on the `undefined` return — `cli`/`mcp` callers updated to
match.

Adopt typescript-eslint's `strictTypeChecked` + `stylisticTypeChecked` across the whole repo
(`core`, `cli`, `mcp`, `tools/html-to-md`), with `restrict-template-expressions` configured to
allow numbers (a pervasive, legitimate pattern here) rather than disabled. No `eslint-disable`
lines were needed — every finding was fixed by removing genuinely-redundant assertions, replacing
type-unsafe `undefined` checks on `Record`/`FxParams` index access with `in` operator checks,
narrowing `NsBlock.detect`/`FvBlock.curve` to their real literal-union types, or restructuring the
handful of cases where a `.find()`/lookup result needed an explicit not-found guard instead of a
non-null assertion.

Widened test/tsconfig coverage so `tests/`, `*.config.ts`, and `tools/html-to-md/*.ts` get the same
type-aware linting as `src/` (previously only `src/` was linted with type information). This
surfaced a real, previously-invisible ordering dependency: type-aware linting needs
`@tonesmith/core` built first (to resolve its types), same as `coverage` did in the prior PR — CI's
step order is now `build → lint → coverage`.

Conservative naming re-pass: shortened a couple of one-line-scope loop variables
(`indexMap`'s `(value, index)` → `(v, i)`, cli read's `patchIndex` → `i`) per the plan's own
examples; no public API renames beyond the registry flatten above.
