/**
 * How a patch spec names the device's blocks, and where each one keeps its controls.
 *
 * These sit in `common/` rather than with the spec validator because two independent surfaces read
 * them: the validator, which enforces the shape, and `capabilities.ts`, which shows it. Keeping the
 * fact in one place is what stops the example a caller is shown from drifting from the shape it is
 * checked against.
 */

/**
 * Every block a patch spec may carry, mapped to the capability group describing it. The three fx
 * slots share one group, so the mapping is spelled out rather than assumed from the block name.
 */
const BLOCK_GROUPS = {
  pfx: "pfx", fx1: "fx", fx2: "fx", fx3: "fx", odds: "odds",
  amp: "amp", ns: "ns", fv: "fv", delay: "delay", reverb: "reverb",
} as const;

type BlockName = keyof typeof BLOCK_GROUPS;

const BLOCK_NAMES = Object.keys(BLOCK_GROUPS) as BlockName[];

/** The blocks that keep their controls in a nested `params` record, as the decoded patch does. */
const NESTED_PARAMS = new Set<string>(["fx1", "fx2", "fx3"]);

export { BLOCK_GROUPS, BLOCK_NAMES, NESTED_PARAMS };
export type { BlockName };
