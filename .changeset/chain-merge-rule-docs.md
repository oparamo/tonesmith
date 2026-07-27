---
"@tonesmith/core": patch
"@tonesmith/mcp": patch
---

Describe the chain merge rule accurately. The chain capability description and the
`generate_gx1_patch` chain docs both said a block left out of a partial chain "keeps its default
position", but `normalizeChain` reinserts each omitted block immediately after whichever block
precedes it in the default order — so an omitted block travels with that neighbor instead of holding
a fixed slot. The two rules agree on contiguous reorders and diverge on everything else, which made
the resolved order unpredictable from the docs. All three descriptions now state the real rule and
share one worked non-contiguous example, and the drift guard asserts the example still demonstrates
an omitted block leaving its default slot.

The chain description also now explains both ways to leave a block off, which previously had to be
guessed at: bypassing with `on: false` keeps the params passed alongside it (the device stores them
behind the bypass), while omitting a block entirely leaves it off at default settings. Both are
valid and they store different bytes. The explanation lives only in the chain view — the per-block
`on` fields keep their one-line description rather than repeating it into every generate schema.
