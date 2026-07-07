import type { gx1 } from "@tonesmith/core";

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
  console.info(`\n  AMP/CAB [${amp.on ? "ON" : "OFF"}]  ${amp.type}`);
  console.info(`    Gain=${amp.gain}  Level=${amp.level}  Bass=${amp.bass}  Mid=${amp.middle}  Treble=${amp.treble}`);
  console.info(`    Speaker=${amp.speaker}  Mic=${amp.mic}  Solo=${amp.solo ? `ON(${amp.soloLevel})` : "OFF"}`);
};

const printOdds = (odds: gx1.Patch["odds"]): void => {
  if (!odds.on) return;
  console.info(`\n  OD/DS [ON]  ${odds.type}  Drive=${odds.drive}  Tone=${odds.tone}  Level=${odds.level}  Direct=${odds.direct}  Solo=${odds.solo ? `ON(${odds.soloLevel})` : "OFF"}`);
};

const printFxSlot = (slot: "fx1" | "fx2" | "fx3", block: gx1.Patch["fx1"]): void => {
  const label = block.type + (block.subType ? ` (${block.subType})` : "");
  console.info(`\n  ${slot.toUpperCase()} [${block.on ? "ON" : "OFF"}]  ${label}`);
  if (Object.keys(block.params).length > 0) {
    console.info(`    ${formatParams(block.params)}`);
  }
};

const printPatch = (patch: gx1.Patch, index?: number): void => {
  printHeader(patch, index);
  printAmp(patch.amp);
  printOdds(patch.odds);

  const pfx = patch.pfx;
  console.info(`\n  PFX [${pfx.on ? "ON" : "OFF"}]  ${pfx.type}`);
  printParams(pfx);

  const ns = patch.ns;
  console.info(`\n  NS [${ns.on ? "ON" : "OFF"}]  Threshold=${ns.threshold}  Release=${ns.release}  Detect=${ns.detect}`);

  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    printFxSlot(slot, patch[slot]);
  }

  const delay = patch.delay;
  console.info(`\n  DELAY [${delay.on ? "ON" : "OFF"}]  ${delay.type}`);
  printParams(delay);

  const reverb = patch.reverb;
  console.info(`\n  REVERB [${reverb.on ? "ON" : "OFF"}]  ${reverb.type}`);
  printParams(reverb);

  const fv = patch.fv;
  console.info(`\n  FV  Position=${fv.position}  Min=${fv.min}  Max=${fv.max}  Curve=${fv.curve}`);
};

export { printPatch };
