import type { BlockView, PatchDetail, PatchView } from "../../types";
import type { Patch } from "./types";
import type { BlockName } from "./common";
import { BLOCK_LABELS, BLOCK_NAMES } from "./common";

const patchDetails = (patch: Patch): PatchDetail[] => {
  const details: PatchDetail[] = [
    { label: "Chain", value: patch.chain.join(", ") },
    { label: "Key", value: patch.key },
  ];
  if (patch.memo) details.push({ label: "Memo", value: patch.memo });
  return details;
};

/**
 * The blocks in the order this patch runs them, then any block its chain left out. The chain decodes
 * from a linked list that stops at the first terminator, so a file the unit did not write can carry
 * a short one, and a block missing from the order is a block whose settings nobody would see.
 */
const displayOrder = (chain: string[]): BlockName[] => {
  const chained = chain.filter((name): name is BlockName => name in BLOCK_LABELS);
  return [...chained, ...BLOCK_NAMES.filter(name => !chained.includes(name))];
};

const blockView = (patch: Patch, name: BlockName): BlockView => {
  const block = patch[name];
  return {
    label: BLOCK_LABELS[name],
    key: name,
    on: block.on,
    type: block.type,
    subType: block.subType,
    params: block.params,
  };
};

const viewPatch = (patch: Patch): PatchView => ({
  name: patch.name,
  details: patchDetails(patch),
  blocks: displayOrder(patch.chain).map(name => blockView(patch, name)),
});

export { viewPatch };
