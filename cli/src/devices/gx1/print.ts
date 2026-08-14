import type { gx1 } from "@tonesmith/core";

const onOff = (on: boolean): string => (on ? "ON" : "OFF");

const formatParams = (params: Record<string, unknown>): string =>
  Object.entries(params).map(([key, value]) => `${key}=${String(value)}`).join("  ");

// What a block is set to belongs on its header line, printed by blockLabel below, rather than
// among the knobs.
const SELECTORS = ["on", "type", "subType"];

/** A block's own knobs: its fields minus the ones its header line already carries. */
const blockKnobs = (block: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(block).filter(([key]) => !SELECTORS.includes(key)));

/** The indented knob line under a block header, skipped for a type that has no knobs. */
const printParamLine = (params: Record<string, unknown>): void => {
  if (Object.keys(params).length > 0) console.info(`    ${formatParams(params)}`);
};

/** A block's type with its sub-model in parentheses, the shape every block's header line takes. */
const blockLabel = (block: { type: string; subType?: unknown }): string => {
  const suffix = typeof block.subType === "string" ? ` (${block.subType})` : "";
  return block.type + suffix;
};

/** A block that selects a type: header line naming what it is set to, then that type's knobs. */
const printTypedBlock = (
  label: string,
  block: { on: boolean; type: string; subType?: unknown },
  params: Record<string, unknown>,
): void => {
  console.info(`\n  ${label} [${onOff(block.on)}]  ${blockLabel(block)}`);
  printParamLine(params);
};

const printHeader = (patch: gx1.Patch, index: number): void => {
  console.info(`\n${"━".repeat(52)}`);
  console.info(`  [${index}] ${patch.name}`);
  console.info("━".repeat(52));
  console.info(`  Chain: ${patch.chain.join(", ")}`);
  console.info(`  Key: ${patch.key}`);
  if (patch.memo) console.info(`  Memo: ${patch.memo}`);
};

const printAmp = (amp: gx1.Patch["amp"]): void => {
  console.info(`\n  AMP/CAB [${onOff(amp.on)}]  ${amp.type}`);
  console.info(`    Gain=${amp.gain}  Level=${amp.level}  Bass=${amp.bass}  Mid=${amp.middle}  Treble=${amp.treble}`);
  const soloLabel = amp.solo ? `ON(${amp.soloLevel})` : "OFF";
  console.info(`    Speaker=${amp.speaker}  Mic=${amp.mic}  Solo=${soloLabel}`);
};

// Printed even when bypassed, like every other block: the device keeps a bypassed block's settings,
// so hiding it would conceal the sound parked behind the bypass.
const printOdds = (odds: gx1.Patch["odds"]): void => {
  const soloLabel = odds.solo ? `ON(${odds.soloLevel})` : "OFF";
  console.info(`\n  OD/DS [${onOff(odds.on)}]  ${odds.type}  Drive=${odds.drive}  Tone=${odds.tone}  Level=${odds.level}  Direct=${odds.direct}  Solo=${soloLabel}`);
};

const printPatch = (patch: gx1.Patch, index: number): void => {
  printHeader(patch, index);
  printAmp(patch.amp);
  printOdds(patch.odds);

  printTypedBlock("PFX", patch.pfx, blockKnobs(patch.pfx));

  const ns = patch.ns;
  console.info(`\n  NS [${onOff(ns.on)}]  Threshold=${ns.threshold}  Release=${ns.release}  Detect=${ns.detect}`);

  // An fx slot keeps its knobs in a params bag rather than on the block, since one slot takes any
  // effect type and they would otherwise collide with the block's own fields.
  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    printTypedBlock(slot.toUpperCase(), patch[slot], patch[slot].params);
  }

  printTypedBlock("DELAY", patch.delay, blockKnobs(patch.delay));
  printTypedBlock("REVERB", patch.reverb, blockKnobs(patch.reverb));

  const fv = patch.fv;
  console.info(`\n  FV  Position=${fv.position}  Min=${fv.min}  Max=${fv.max}  Curve=${fv.curve}`);
};

export { printPatch };
