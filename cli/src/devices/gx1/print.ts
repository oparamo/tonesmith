import type { gx1 } from "tonesmith";

const fmt = (d: Record<string, unknown>): string =>
  Object.entries(d).map(([k, v]) => `${k}=${String(v)}`).join("  ");

const printParams = (block: Record<string, unknown>): void => {
  const params = Object.fromEntries(Object.entries(block).filter(([k]) => k !== "on" && k !== "type"));
  if (Object.keys(params).length > 0) console.info(`    ${fmt(params)}`);
};

const printPatch = (p: gx1.Patch, index?: number): void => {
  const label = index !== undefined ? `[${index}] ` : "";
  console.info(`\n${"━".repeat(52)}`);
  console.info(`  ${label}${p.name}`);
  console.info("━".repeat(52));
  console.info(`  Chain: ${p.chain.join(" → ")}`);

  const a = p.amp;
  console.info(`\n  AMP/CAB [${a.on ? "ON" : "OFF"}]  ${a.type}`);
  console.info(`    Gain=${a.gain}  Level=${a.level}  Bass=${a.bass}  Mid=${a.middle}  Treble=${a.treble}`);
  console.info(`    Speaker=${a.speaker}  Mic=${a.mic}`);

  const od = p.odds;
  if (od.on) {
    console.info(`\n  OD/DS [ON]  ${od.type}  Drive=${od.drive}  Tone=${od.tone}  Level=${od.level}  Direct=${od.direct}`);
  }

  console.info(`\n  NS [${p.ns.on ? "ON" : "OFF"}]  Threshold=${p.ns.threshold}  Release=${p.ns.release}  Detect=${p.ns.detect}`);

  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    const block = p[slot];
    const lbl = block.type + (block.subtype ? ` (${block.subtype})` : "");
    console.info(`\n  ${slot.toUpperCase()} [${block.on ? "ON" : "OFF"}]  ${lbl}`);
    if (Object.keys(block.params).length > 0) {
      console.info(`    ${fmt(block.params)}`);
    }
  }

  const dly = p.delay;
  console.info(`\n  DELAY [${dly.on ? "ON" : "OFF"}]  ${dly.type}`);
  printParams(dly);

  const rev = p.reverb;
  console.info(`\n  REVERB [${rev.on ? "ON" : "OFF"}]  ${rev.type}`);
  printParams(rev);

  console.info(`\n  FV  Position=${p.fv.position}  Min=${p.fv.min}  Max=${p.fv.max}  Curve=${p.fv.curve}`);
};

export { printPatch };
