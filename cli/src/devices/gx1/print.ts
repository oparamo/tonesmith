import type { gx1 } from "@tonesmith/core";

const formatParams = (params: Record<string, unknown>): string =>
  Object.entries(params).map(([key, value]) => `${key}=${String(value)}`).join("  ");

const printParams = (block: Record<string, unknown>): void => {
  const params = Object.fromEntries(Object.entries(block).filter(([key]) => key !== "on" && key !== "type"));
  if (Object.keys(params).length > 0) console.info(`    ${formatParams(params)}`);
};

const printPatch = (patch: gx1.Patch, index?: number): void => {
  const label = index !== undefined ? `[${index}] ` : "";
  console.info(`\n${"━".repeat(52)}`);
  console.info(`  ${label}${patch.name}`);
  console.info("━".repeat(52));
  console.info(`  Chain: ${patch.chain.join(" → ")}`);

  const amp = patch.amp;
  console.info(`\n  AMP/CAB [${amp.on ? "ON" : "OFF"}]  ${amp.type}`);
  console.info(`    Gain=${amp.gain}  Level=${amp.level}  Bass=${amp.bass}  Mid=${amp.middle}  Treble=${amp.treble}`);
  console.info(`    Speaker=${amp.speaker}  Mic=${amp.mic}  Solo=${amp.solo ? `ON(${amp.soloLevel})` : "OFF"}`);

  const odds = patch.odds;
  if (odds.on) {
    console.info(`\n  OD/DS [ON]  ${odds.type}  Drive=${odds.drive}  Tone=${odds.tone}  Level=${odds.level}  Direct=${odds.direct}  Solo=${odds.solo ? `ON(${odds.soloLevel})` : "OFF"}`);
  }

  const pfx = patch.pfx;
  console.info(`\n  PFX [${pfx.on ? "ON" : "OFF"}]  ${pfx.type}`);
  printParams(pfx);

  console.info(`\n  NS [${patch.ns.on ? "ON" : "OFF"}]  Threshold=${patch.ns.threshold}  Release=${patch.ns.release}  Detect=${patch.ns.detect}`);

  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    const block = patch[slot];
    const label = block.type + (block.subType ? ` (${block.subType})` : "");
    console.info(`\n  ${slot.toUpperCase()} [${block.on ? "ON" : "OFF"}]  ${label}`);
    if (Object.keys(block.params).length > 0) {
      console.info(`    ${formatParams(block.params)}`);
    }
  }

  const delay = patch.delay;
  console.info(`\n  DELAY [${delay.on ? "ON" : "OFF"}]  ${delay.type}`);
  printParams(delay);

  const reverb = patch.reverb;
  console.info(`\n  REVERB [${reverb.on ? "ON" : "OFF"}]  ${reverb.type}`);
  printParams(reverb);

  console.info(`\n  FV  Position=${patch.fv.position}  Min=${patch.fv.min}  Max=${patch.fv.max}  Curve=${patch.fv.curve}`);
};

export { printPatch };
