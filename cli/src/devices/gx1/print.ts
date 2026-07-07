import type { gx1 } from "@tonesmith/core";

const onOff = (on: boolean): string => (on ? "ON" : "OFF");

const formatParams = (params: Record<string, unknown>): string =>
  Object.entries(params).map(([key, value]) => `${key}=${String(value)}`).join("  ");

const printParams = (block: Record<string, unknown>): void => {
  const params = Object.fromEntries(Object.entries(block).filter(([key]) => key !== "on" && key !== "type"));
  if (Object.keys(params).length > 0) console.info(`    ${formatParams(params)}`);
};

const printHeader = (patch: gx1.Patch, index?: number): void => {
  const label = index !== undefined ? `[${index}] ` : "";
  console.info(`\n${"━".repeat(52)}`);
  console.info(`  ${label}${patch.name}`);
  console.info("━".repeat(52));
  console.info(`  Chain: ${patch.chain.join(" → ")}`);
  console.info(`  Key: ${patch.key}`);
};

const printAmp = (amp: gx1.Patch["amp"]): void => {
  console.info(`\n  AMP/CAB [${onOff(amp.on)}]  ${amp.type}`);
  console.info(`    Gain=${amp.gain}  Level=${amp.level}  Bass=${amp.bass}  Mid=${amp.middle}  Treble=${amp.treble}`);
  const soloLabel = amp.solo ? `ON(${amp.soloLevel})` : "OFF";
  console.info(`    Speaker=${amp.speaker}  Mic=${amp.mic}  Solo=${soloLabel}`);
};

const printOdds = (odds: gx1.Patch["odds"]): void => {
  if (!odds.on) return;
  const soloLabel = odds.solo ? `ON(${odds.soloLevel})` : "OFF";
  console.info(`\n  OD/DS [ON]  ${odds.type}  Drive=${odds.drive}  Tone=${odds.tone}  Level=${odds.level}  Direct=${odds.direct}  Solo=${soloLabel}`);
};

const printFxSlot = (slot: "fx1" | "fx2" | "fx3", block: gx1.Patch["fx1"]): void => {
  const subTypeSuffix = block.subType ? ` (${block.subType})` : "";
  const label = block.type + subTypeSuffix;
  console.info(`\n  ${slot.toUpperCase()} [${onOff(block.on)}]  ${label}`);
  if (Object.keys(block.params).length > 0) {
    console.info(`    ${formatParams(block.params)}`);
  }
};

const printPatch = (patch: gx1.Patch, index?: number): void => {
  printHeader(patch, index);
  printAmp(patch.amp);
  printOdds(patch.odds);

  const pfx = patch.pfx;
  console.info(`\n  PFX [${onOff(pfx.on)}]  ${pfx.type}`);
  printParams(pfx);

  const ns = patch.ns;
  console.info(`\n  NS [${onOff(ns.on)}]  Threshold=${ns.threshold}  Release=${ns.release}  Detect=${ns.detect}`);

  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    printFxSlot(slot, patch[slot]);
  }

  const delay = patch.delay;
  console.info(`\n  DELAY [${onOff(delay.on)}]  ${delay.type}`);
  printParams(delay);

  const reverb = patch.reverb;
  console.info(`\n  REVERB [${onOff(reverb.on)}]  ${reverb.type}`);
  printParams(reverb);

  const fv = patch.fv;
  console.info(`\n  FV  Position=${fv.position}  Min=${fv.min}  Max=${fv.max}  Curve=${fv.curve}`);
};

export { printPatch };
