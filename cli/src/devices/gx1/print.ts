import type { gx1 } from "@tonesmith/core";

const onOff = (on: boolean): string => (on ? "ON" : "OFF");

const formatParams = (params: Record<string, unknown>): string =>
  Object.entries(params).map(([key, value]) => `${key}=${String(value)}`).join("  ");

/** The indented param line under a block header, skipped for a type that has no params. */
const printParamLine = (params: Record<string, unknown>): void => {
  if (Object.keys(params).length > 0) console.info(`    ${formatParams(params)}`);
};

/** A block's type with its sub-model in parentheses, the shape every block's header line takes. */
const blockLabel = (block: { type: string; subType?: unknown }): string => {
  const suffix = typeof block.subType === "string" ? ` (${block.subType})` : "";
  return block.type + suffix;
};

/** A block that selects a type: header line naming what it is set to, then that type's params. */
const printTypedBlock = (
  label: string,
  block: { on: boolean; type: string; subType?: unknown; params: Record<string, unknown> },
): void => {
  console.info(`\n  ${label} [${onOff(block.on)}]  ${blockLabel(block)}`);
  printParamLine(block.params);
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
  const { params } = amp;
  console.info(`\n  AMP/CAB [${onOff(amp.on)}]  ${amp.type}`);
  console.info(`    Gain=${params.gain}  Level=${params.level}  Bass=${params.bass}  Mid=${params.middle}  Treble=${params.treble}`);
  const soloLabel = params.solo ? `ON(${params.soloLevel})` : "OFF";
  console.info(`    Speaker=${params.speaker}  Mic=${params.mic}  Solo=${soloLabel}`);
};

// Printed even when bypassed, like every other block: the device keeps a bypassed block's settings,
// so hiding it would conceal the sound parked behind the bypass.
const printDrive = (drive: gx1.Patch["drive"]): void => {
  const { params } = drive;
  const soloLabel = params.solo ? `ON(${params.soloLevel})` : "OFF";
  console.info(`\n  OD/DS [${onOff(drive.on)}]  ${drive.type}  Drive=${params.drive}  Tone=${params.tone}  Level=${params.level}  Direct=${params.direct}  Solo=${soloLabel}`);
};

const printPatch = (patch: gx1.Patch, index: number): void => {
  printHeader(patch, index);
  printAmp(patch.amp);
  printDrive(patch.drive);

  printTypedBlock("PFX", patch.pedalFx);

  const gate = patch.noiseGate.params;
  console.info(`\n  NS [${onOff(patch.noiseGate.on)}]  Threshold=${gate.threshold}  Release=${gate.release}  Detect=${gate.detect}`);

  for (const slot of ["fx1", "fx2", "fx3"] as const) {
    printTypedBlock(slot.toUpperCase(), patch[slot]);
  }

  printTypedBlock("DELAY", patch.delay);
  printTypedBlock("REVERB", patch.reverb);

  const volume = patch.volume.params;
  console.info(`\n  FV  Position=${volume.position}  Min=${volume.min}  Max=${volume.max}  Curve=${volume.curve}`);
};

export { printPatch };
