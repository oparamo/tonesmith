/**
 * How a patch spec names the device's blocks, and what the device's own panel calls each one.
 *
 * These sit in `common/` rather than with the spec validator because two independent surfaces read
 * them: the validator, which enforces the shape, and `capabilities.ts`, which shows it. Keeping the
 * fact in one place is what stops the example a caller is shown from drifting from the shape it is
 * checked against.
 *
 * A block's spec name is a plain word chosen for whoever is reading it. The GX-1's own labels are
 * abbreviations that only mean something next to the unit, and three of them (OD/DS, DLY, REV) are
 * not even a guess away from the name a caller writes, so the panel label lives here as a mapping
 * the driver owns rather than as the key itself.
 */
import { SUB_TYPE_FIELD } from "./constants";

/**
 * Every block a patch spec may carry, mapped to the capability group describing it. The three fx
 * slots share one group, so the mapping is spelled out rather than assumed from the block name.
 */
const BLOCK_GROUPS = {
  pedalFx: "pedalFx", fx1: "fx", fx2: "fx", fx3: "fx", drive: "drive",
  amp: "amp", noiseGate: "noiseGate", volume: "volume", delay: "delay", reverb: "reverb",
} as const;

type BlockName = keyof typeof BLOCK_GROUPS;

const BLOCK_NAMES = Object.keys(BLOCK_GROUPS) as BlockName[];

/**
 * Types the device offers in one block only, mapped to the block that has them. OVERTONE keeps its
 * params in `MEMORY%FX3A`, a block that exists for FX3 alone, so in either other slot they would be
 * written over whatever type owns offset 0 of the shared param block.
 */
const BLOCK_ONLY_TYPES: Record<string, BlockName> = { "OVERTONE": "fx3" };

/** The block a type belongs to when it belongs to only one, and undefined when any block takes it. */
const onlyBlockFor = (type: string): BlockName | undefined => BLOCK_ONLY_TYPES[type];

/** What the device's own front panel and manual call each block, for display and for the chain. */
const BLOCK_LABELS: Record<BlockName, string> = {
  pedalFx: "PFX", fx1: "FX1", fx2: "FX2", fx3: "FX3", drive: "OD/DS",
  amp: "AMP", noiseGate: "NS", volume: "FV", delay: "DLY", reverb: "REV",
};

/** The reverse, for reading a chain the device stored under its own labels. */
const BLOCK_FOR_LABEL: Record<string, BlockName | undefined> = Object.fromEntries(
  Object.entries(BLOCK_LABELS).map(([block, label]) => [label, block as BlockName])
);

const TYPE_FIELD = "type";
const ON_FIELD = "on";
const PARAMS_FIELD = "params";

/** The fields that select a block's shape rather than set one of its controls. */
const SELECTION_FIELDS = new Set<string>([TYPE_FIELD, SUB_TYPE_FIELD, ON_FIELD]);

export {
  BLOCK_GROUPS, BLOCK_NAMES, BLOCK_LABELS, BLOCK_FOR_LABEL, SELECTION_FIELDS, onlyBlockFor,
  ON_FIELD, PARAMS_FIELD, TYPE_FIELD,
};
export type { BlockName };
