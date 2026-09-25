import type { BlockView, PatchView } from "@tonesmith/core";
import { BOLD, CYAN, DIM, GREEN, RESET, YELLOW } from "./color";

const RULE = "━".repeat(52);

/** The bypass state, for a block the device can bypass and nothing for one it always runs. */
const bypassTag = (on?: boolean): string => {
  if (on === undefined) return "";
  const tag = on ? `${GREEN}[ON]${RESET}` : `${DIM}[OFF]${RESET}`;
  return `  ${tag}`;
};

/** What the block is set to: its type, plus the model within it where the type carries one. */
const selectionTag = (block: BlockView): string => {
  if (block.type === undefined) return "";
  const model = block.subType ? ` ${DIM}(${block.subType})${RESET}` : "";
  return `  ${CYAN}${block.type}${RESET}${model}`;
};

const paramList = (params: BlockView["params"]): string =>
  Object.entries(params).map(([key, value]) => `${key}=${String(value)}`).join("  ");

/**
 * A block's header line, then its controls under it. The key sits beside the panel label because
 * the key is what a `write` dot-path and a patch spec take, and an abbreviated label rarely gives
 * it away.
 */
const printBlock = (block: BlockView): void => {
  const header = `${BOLD}${block.label}${RESET} ${DIM}[${block.key}]${RESET}`;
  console.info(`\n  ${header}${bypassTag(block.on)}${selectionTag(block)}`);
  // A type the codec has no field map for decodes carrying no controls, leaving nothing to print.
  if (Object.keys(block.params).length > 0) console.info(`    ${paramList(block.params)}`);
};

/** Print one patch as its driver describes it, knowing nothing about the device it came from. */
const printPatch = (view: PatchView, index: number): void => {
  console.info(`\n${RULE}`);
  console.info(`  ${BOLD}[${index}] ${view.name}${RESET}`);
  console.info(RULE);
  for (const detail of view.details) {
    console.info(`  ${YELLOW}${detail.label}:${RESET} ${detail.value}`);
  }
  for (const block of view.blocks) printBlock(block);
};

export { printPatch };
