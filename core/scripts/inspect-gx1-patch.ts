// Dev-only inspection tool for poking at decoded patches and raw bytes while debugging
// the codec. Not part of the published package -- run directly via tsx.
//
// Usage:
//   tsx scripts/inspect-gx1-patch.ts <file.tsl>                              list patch names
//   tsx scripts/inspect-gx1-patch.ts <file.tsl> <patchName>                  dump decoded patch JSON
//   tsx scripts/inspect-gx1-patch.ts <file.tsl> <patchName> <rawKey>         dump raw bytes for a
//                                                                   MEMORY%<rawKey> block
//   tsx scripts/inspect-gx1-patch.ts <file.tsl> <patchName> <rawKey> <start> <end>
//                                                                   dump a byte range
//
// rawKey is one of the RawParamSet keys, e.g. FX1, FX2, FX3, DLY, REV, AMP, ODDS, NS, FV,
// CHAIN, COM (without the "MEMORY%" prefix).

import { gx1 } from "../src";

const [filePath, patchName, rawKey, startArg, endArg] = process.argv.slice(2);

if (!filePath) {
  console.error("Usage: tsx scripts/inspect-gx1-patch.ts <file.tsl> [patchName] [rawKey] [start] [end]");
  process.exit(1);
}

const file = gx1.driver.readFile(filePath);

if (!patchName) {
  for (const p of file.patches) console.log(p.name);
  process.exit(0);
}

const patch = file.patches.find(p => p.name === patchName);
if (!patch) {
  console.error(`Patch not found: ${patchName}`);
  console.error("Available:", file.patches.map(p => p.name).join(", "));
  process.exit(1);
}

if (!rawKey) {
  console.log(JSON.stringify(patch, (_k, v) => typeof v === "symbol" ? undefined : v, 2));
  process.exit(0);
}

const rawSymbol = Object.getOwnPropertySymbols(patch)[0]!;
const hexList: string[] = (patch as Record<symbol, Record<string, string[]>>)[rawSymbol][`MEMORY%${rawKey}`];
if (!hexList) {
  console.error(`No MEMORY%${rawKey} block on this patch.`);
  process.exit(1);
}

const bytes = hexList.map(h => parseInt(h, 16));
const start = startArg ? Number(startArg) : 0;
const end = endArg ? Number(endArg) : bytes.length;

for (let i = start; i < end; i++) console.log(i, "=", bytes[i]);
