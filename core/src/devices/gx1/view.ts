import type { BlockView, PatchDetail, PatchView } from "../../types";
import type { Patch } from "./types";
import type { BlockName } from "./common";
import { BLOCK_LABELS, BLOCK_NAMES } from "./common";

const onOff = (setting: boolean): string => (setting ? "ON" : "OFF");

const patchDetails = (patch: Patch): PatchDetail[] => {
  const details: PatchDetail[] = [
    { label: "Chain", value: patch.chain.join(", ") },
    { label: "Memory level", value: String(patch.memoryLevel) },
    // Named as the tempo rather than as BPM, since a reader meeting "1/4" in the delay below has
    // to be able to find what that note plays against.
    { label: "Tempo", value: `${patch.bpm} BPM` },
    { label: "Key", value: patch.key },
    { label: "Carryover", value: onOff(patch.carryover) },
    { label: "Tempo hold", value: onOff(patch.tempoHold) },
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
